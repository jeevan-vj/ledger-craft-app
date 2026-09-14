import { errorEnvelopeSchema, invoiceSchema } from '@ledgercraft/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import type { InvoiceMailer } from './mailer';

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

const originHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`;
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: originHeaders,
    body: JSON.stringify({ name, email, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return { cookie: cookieHeader(response) };
}

async function seedCustomerAndProfile(
  app: ReturnType<typeof createApp>,
  cookie: string,
) {
  await app.request('/api/business-profile', {
    method: 'PUT',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      name: 'Kauri Studio Ltd',
      email: 'hello@kauristudio.nz',
      country: 'NZ',
      defaultTaxRate: '15',
      invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
      invoiceNumberSequence: 0,
    }),
  });
  const customer = await app.request('/api/customers', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'North Harbour Cafe', email: 'hello@nhcafe.nz', country: 'NZ' }),
  });
  expect(customer.status).toBe(201);
  return (await customer.json()) as { id: string };
}

describe('invoice routes', () => {
  it('persists named delivery charges, recalculates percentages and clears charges', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db });
        const owner = await signUp(app, 'Delivery Owner');
        const customer = await seedCustomerAndProfile(app, owner.cookie);
        const headers = { ...originHeaders, Cookie: owner.cookie };
        const charge = { id: 'delivery-1', type: 'delivery', label: 'Delivery', calculationType: 'fixed', amount: '30', isActive: true };
        const created = await app.request('/api/invoices', { method: 'POST', headers, body: JSON.stringify({
          customerId: customer.id, date: '2026-09-14', dueDate: '2026-10-14', taxInclusive: false, taxRate: '15',
          items: [{ description: 'Goods', quantity: '1', rate: '100' }], additionalChargesList: [charge], additionalCharges: '999',
        }) });
        expect(created.status).toBe(201);
        const invoice = await created.json() as any;
        expect(invoice.additionalChargesList).toEqual([charge]);
        expect(invoice.additionalCharges).toBe('30.00');
        expect(invoice.total).toBe('145.00');
        const read = await app.request(`/api/invoices/${invoice.id}`, { headers });
        expect((await read.json() as any).additionalChargesList).toEqual([charge]);
        const patch = async (body: unknown) => {
          const result = await app.request(`/api/invoices/${invoice.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
          expect(result.status).toBe(200);
          return await result.json() as any;
        };
        expect((await patch({ notes: 'Keep delivery' })).additionalChargesList).toEqual([charge]);
        const percent = await patch({ additionalChargesList: [{ ...charge, calculationType: 'percentage', amount: '10' }] });
        expect(percent.total).toBe('125.00');
        expect((await patch({ items: [{ description: 'Goods', quantity: '2', rate: '100' }] })).additionalCharges).toBe('20.00');
        const cleared = await patch({ additionalChargesList: [] });
        expect(cleared.additionalChargesList).toEqual([]);
        expect(cleared.total).toBe('230.00');
        expect(cleared.additionalCharges).toBeNull();
        await patch({ additionalCharges: '30' });
        expect((await patch({ additionalCharges: null })).additionalCharges).toBeNull();
      } finally { await sql.end({ timeout: 5 }); }
    });
  });

  it('unauthenticated GET /api/invoices returns 401', async () => {
    const response = await createApp().request('/api/invoices');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('peeks next invoice number and creates without a pre-seeded business profile', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner Fresh');

        const peeked = await app.request('/api/invoices/next-number', {
          headers: { Cookie: owner.cookie },
        });
        expect(peeked.status).toBe(200);
        expect((await peeked.json() as { invoiceNumber: string }).invoiceNumber).toMatch(/^INV-\d{4}-0001$/);

        const customer = await app.request('/api/customers', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Fresh Cafe', email: 'hello@freshcafe.nz', country: 'NZ' }),
        });
        expect(customer.status).toBe(201);
        const customerId = ((await customer.json()) as { id: string }).id;

        const created = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId,
            date: '2026-09-07',
            dueDate: '2026-10-07',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Design', quantity: '1', rate: '100' }],
          }),
        });
        expect(created.status).toBe(201);
        const invoice = invoiceSchema.parse(await created.json());
        expect(invoice.invoiceNumber).toBe('INV-2026-0001');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('creates an invoice with server totals and isolates organisations', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');
        const customer = await seedCustomerAndProfile(app, ownerA.cookie);

        const created = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-07',
            dueDate: '2026-10-07',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
          }),
        });
        expect(created.status).toBe(201);
        const invoice = invoiceSchema.parse(await created.json());
        expect(invoice.subtotal).toBe('4500.00');
        expect(invoice.taxAmount).toBe('675.00');
        expect(invoice.total).toBe('5175.00');
        expect(invoice.invoiceNumber).toMatch(/^INV-2026-/);

        const leaked = await app.request(`/api/invoices/${invoice.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(leaked.status).toBe(404);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('copies profile payment terms and keeps an overridden due date', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner Terms');
        const customer = await seedCustomerAndProfile(app, owner.cookie);

        const created = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-10-08',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
          }),
        });
        expect(created.status).toBe(201);
        const invoice = invoiceSchema.parse(await created.json());
        expect(invoice.paymentTermDays).toBe(30);
        expect(invoice.dueDate).toBe('2026-10-08');

        const dueOnReceipt = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-09-08',
            paymentTermDays: 0,
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Same-day work', quantity: '1', rate: '100' }],
          }),
        });
        expect(dueOnReceipt.status).toBe(201);
        expect(invoiceSchema.parse(await dueOnReceipt.json()).dueDate).toBe('2026-09-08');

        const override = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-11-01',
            paymentTermDays: 30,
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Custom due', quantity: '1', rate: '100' }],
          }),
        });
        const overridden = invoiceSchema.parse(await override.json());
        expect(overridden.dueDate).toBe('2026-11-01');
        expect(overridden.paymentTermDays).toBe(30);

        const savedTerms = await app.request('/api/business-profile', {
          method: 'PUT',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            name: 'Kauri Studio Ltd',
            email: 'hello@kauristudio.nz',
            country: 'NZ',
            defaultTaxRate: '15',
            paymentTermDays: 14,
          }),
        });
        expect(savedTerms.status).toBe(200);
        const next = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-09-22',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Fourteen', quantity: '1', rate: '100' }],
          }),
        });
        expect(invoiceSchema.parse(await next.json()).paymentTermDays).toBe(14);

        const patched = await app.request(`/api/invoices/${invoice.id}`, {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ paymentTermDays: 60, dueDate: '2026-11-07' }),
        });
        expect(invoiceSchema.parse(await patched.json()).paymentTermDays).toBe(60);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('computes percent and fixed discounts on the server and recalculates on edit', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner Discount');
        const customer = await seedCustomerAndProfile(app, owner.cookie);

        const percent = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-10-08',
            taxInclusive: false,
            taxRate: '15',
            discountType: 'percent',
            discountPercent: '10',
            discount: '999',
            items: [{ description: 'Consulting', quantity: '1', rate: '1000' }],
          }),
        });
        expect(percent.status).toBe(201);
        const percentInvoice = invoiceSchema.parse(await percent.json());
        expect(percentInvoice.discountType).toBe('percent');
        expect(percentInvoice.discountPercent).toBe('10.00');
        expect(percentInvoice.discount).toBe('100.00');
        expect(percentInvoice.taxAmount).toBe('135.00');
        expect(percentInvoice.total).toBe('1035.00');

        const edited = await app.request(`/api/invoices/${percentInvoice.id}`, {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            discountType: 'percent',
            discountPercent: '10',
            items: [{ description: 'Consulting', quantity: '2', rate: '1000' }],
          }),
        });
        const editedInvoice = invoiceSchema.parse(await edited.json());
        expect(editedInvoice.discount).toBe('200.00');
        expect(editedInvoice.taxAmount).toBe('270.00');

        const tooMuch = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-10-08',
            taxInclusive: false,
            taxRate: '15',
            discountType: 'fixed',
            discount: '1000.01',
            items: [{ description: 'Consulting', quantity: '1', rate: '1000' }],
          }),
        });
        expect(tooMuch.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await tooMuch.json()).error.message).toMatch(/subtotal/i);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('saves drafts without mail and sends only after the mailer accepts', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const mailer: InvoiceMailer = {
          sendInvoice: vi.fn().mockResolvedValue(undefined),
        };
        const app = createApp({ auth, db, checkDatabase: async () => true, invoiceMailer: mailer });
        const owner = await signUp(app, 'Owner Send');
        const customer = await seedCustomerAndProfile(app, owner.cookie);

        const draft = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-10-08',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
          }),
        });
        const draftInvoice = invoiceSchema.parse(await draft.json());
        expect(draftInvoice.status).toBe('draft');
        expect(mailer.sendInvoice).not.toHaveBeenCalled();

        const sent = await app.request(`/api/invoices/${draftInvoice.id}/send`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({}),
        });
        expect(sent.status).toBe(200);
        const sentInvoice = invoiceSchema.parse(await sent.json());
        expect(sentInvoice.status).toBe('sent');
        expect(mailer.sendInvoice).toHaveBeenCalledTimes(1);
        expect(vi.mocked(mailer.sendInvoice).mock.calls[0][0].to).toEqual(['hello@nhcafe.nz']);
        expect(vi.mocked(mailer.sendInvoice).mock.calls[0][0].invoiceNumber).toBe(draftInvoice.invoiceNumber);

        const resend = await app.request(`/api/invoices/${draftInvoice.id}/send`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({}),
        });
        expect(resend.status).toBe(200);
        expect(mailer.sendInvoice).toHaveBeenCalledTimes(2);

        const failingMailer: InvoiceMailer = {
          sendInvoice: vi.fn().mockRejectedValue(new Error('smtp down')),
        };
        const failingApp = createApp({ auth, db, checkDatabase: async () => true, invoiceMailer: failingMailer });
        const failingDraft = await failingApp.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-10-08',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Unsent', quantity: '1', rate: '10' }],
          }),
        });
        const failingInvoice = invoiceSchema.parse(await failingDraft.json());
        const failed = await failingApp.request(`/api/invoices/${failingInvoice.id}/send`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({}),
        });
        expect(failed.status).toBe(502);
        expect(errorEnvelopeSchema.parse(await failed.json()).error.code).toBe('email_failed');
        const stillDraft = await failingApp.request(`/api/invoices/${failingInvoice.id}`, {
          headers: { Cookie: owner.cookie },
        });
        expect(invoiceSchema.parse(await stillDraft.json()).status).toBe('draft');

        const noEmailCustomer = await app.request('/api/customers', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ name: 'No Email Ltd', email: '', country: 'NZ' }),
        });
        const noEmail = (await noEmailCustomer.json()) as { id: string };
        const noEmailDraft = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({
            customerId: noEmail.id,
            date: '2026-09-08',
            dueDate: '2026-10-08',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Mute', quantity: '1', rate: '10' }],
          }),
        });
        const muteInvoice = invoiceSchema.parse(await noEmailDraft.json());
        const blocked = await app.request(`/api/invoices/${muteInvoice.id}/send`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({}),
        });
        expect(blocked.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await blocked.json()).error.code).toBe('customer_email_required');
        expect(mailer.sendInvoice).toHaveBeenCalledTimes(2);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('ignores client-supplied totals on create', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner C');
        const customer = await seedCustomerAndProfile(app, owner.cookie);

        const forged = {
          customerId: customer.id,
          date: '2026-09-07',
          dueDate: '2026-10-07',
          taxInclusive: false,
          taxRate: '15',
          items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
          total: '1.00',
        };
        const response = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify(forged),
        });
        expect(response.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('retried create with the same Idempotency-Key returns the original invoice', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner Idempotent');
        const customer = await seedCustomerAndProfile(app, owner.cookie);
        const payload = {
          customerId: customer.id,
          date: '2026-09-08',
          dueDate: '2026-10-08',
          taxInclusive: false,
          taxRate: '15',
          items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
        };
        const headers = {
          ...originHeaders,
          Cookie: owner.cookie,
          'Idempotency-Key': 'create-invoice-retry-1',
        };

        const first = await app.request('/api/invoices', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        expect(first.status).toBe(201);
        const original = invoiceSchema.parse(await first.json());

        const retry = await app.request('/api/invoices', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        expect(retry.status).toBe(201);
        const replayed = invoiceSchema.parse(await retry.json());
        expect(replayed.id).toBe(original.id);
        expect(replayed.invoiceNumber).toBe(original.invoiceNumber);

        const listed = await app.request('/api/invoices', { headers: { Cookie: owner.cookie } });
        const body = (await listed.json()) as { invoices: unknown[] };
        expect(body.invoices).toHaveLength(1);

        const conflict = await app.request('/api/invoices', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...payload, notes: 'different payload' }),
        });
        expect(conflict.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('share tokens expire and do not leak other organisations', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner Share A');
        const ownerB = await signUp(app, 'Owner Share B');
        const customer = await seedCustomerAndProfile(app, ownerA.cookie);
        const created = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-09-08',
            dueDate: '2026-10-08',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
          }),
        });
        const invoice = invoiceSchema.parse(await created.json());

        const unauthenticatedShare = await createApp().request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: originHeaders,
          body: JSON.stringify({ templateName: 'classic' }),
        });
        expect(unauthenticatedShare.status).toBe(401);

        const leakedShare = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerB.cookie },
          body: JSON.stringify({ templateName: 'classic' }),
        });
        expect(leakedShare.status).toBe(404);

        const shared = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ templateName: 'classic' }),
        });
        expect(shared.status).toBe(201);
        const share = (await shared.json()) as { shareToken: string };
        expect(share.shareToken).toMatch(/^[0-9a-f-]{36}_[0-9a-f-]{36}$/i);

        const publicView = await app.request(`/api/public/invoices/${share.shareToken}`);
        expect(publicView.status).toBe(200);
        const snapshot = (await publicView.json()) as { invoice: { id: string }; templateName: string };
        expect(snapshot.invoice.id).toBe(invoice.id);
        expect(snapshot.templateName).toBe('classic');

        const expired = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            templateName: 'classic',
            expiresAt: '2020-01-01T00:00:00.000Z',
          }),
        });
        expect(expired.status).toBe(201);
        const expiredShare = (await expired.json()) as { shareToken: string };
        const expiredView = await app.request(`/api/public/invoices/${expiredShare.shareToken}`);
        expect(expiredView.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await expiredView.json()).error.code).toBe('NOT_FOUND');

        const missing = await app.request('/api/public/invoices/does-not-exist-token');
        expect(missing.status).toBe(404);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
