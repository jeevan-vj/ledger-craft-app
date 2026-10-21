import { errorEnvelopeSchema, invoiceSchema, quoteSchema } from '@ledgercraft/contracts';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import type { Database } from '../../db/client';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createUnavailableInvoiceMailer, type InvoiceMailer } from '../invoices/mailer';
import { addCalendarDays } from '../invoices/payment-terms';
import { aucklandToday } from './quotes.transitions';

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
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

async function seedCustomerAndProfile(app: ReturnType<typeof createApp>, cookie: string, paymentTermDays = 14) {
  const saved = await app.request('/api/business-profile', {
    method: 'PUT',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      name: 'Kauri Studio Ltd',
      email: 'hello@kauristudio.nz',
      country: 'NZ',
      defaultTaxRate: '15',
      paymentTermDays,
      invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
      invoiceNumberSequence: 1,
      quoteNumberFormat: 'QUO-{YYYY}-{SEQ}',
      quoteNumberSequence: 1,
      quoteValidityDays: 30,
      defaultQuoteKind: 'quote',
    }),
  });
  expect(saved.status).toBe(200);
  const customer = await app.request('/api/customers', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'North Harbour Cafe', email: 'hello@nhcafe.nz', country: 'NZ' }),
  });
  expect(customer.status).toBe(201);
  return (await customer.json()) as { id: string };
}

const exclusiveQuote = {
  date: '2026-10-22',
  expiryDate: '2099-01-01',
  taxInclusive: false,
  taxRate: '15',
  discountType: 'percent' as const,
  discountPercent: '10',
  additionalChargesList: [{
    id: 'delivery-1',
    type: 'delivery' as const,
    label: 'Delivery',
    calculationType: 'fixed' as const,
    amount: '5',
    isActive: true,
  }],
  additionalCharges: '999',
  items: [{ description: 'Labour', quantity: '2', rate: '100' }],
};

async function journalRows(db: Database) {
  return db.execute<{ reference_type: string | null; reference_id: string | null; description: string; n: number }>(
    sql`SELECT reference_type, reference_id, description, (SELECT count(*) FROM journal_entry_lines) AS n FROM journal_entries`,
  );
}

describe('quote routes', () => {
  it('unauthenticated GET /api/quotes returns 401', async () => {
    const response = await createApp().request('/api/quotes');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('keeps quote numbering independent and matches invoice totals', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql: close } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Quote Owner');
        const other = await signUp(app, 'Other Studio');
        const customer = await seedCustomerAndProfile(app, owner.cookie);
        const headers = { ...originHeaders, Cookie: owner.cookie };

        const peekedQuote = await app.request('/api/quotes/next-number', { headers });
        const peekedInvoice = await app.request('/api/invoices/next-number', { headers });
        expect((await peekedQuote.json() as { quoteNumber: string }).quoteNumber).toMatch(/^QUO-\d{4}-0001$/);
        expect((await peekedInvoice.json() as { invoiceNumber: string }).invoiceNumber).toMatch(/^INV-\d{4}-0001$/);

        const rejected = await app.request('/api/quotes', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...exclusiveQuote, customerId: customer.id, total: '1.00', organisationId: '11111111-1111-1111-1111-111111111111' }),
        });
        expect(rejected.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await rejected.json()).error.code).toBe('VALIDATION_ERROR');

        const created = await app.request('/api/quotes', {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': 'quote-create-1' },
          body: JSON.stringify({ ...exclusiveQuote, customerId: customer.id, kind: 'estimate' }),
        });
        expect(created.status).toBe(201);
        const quote = quoteSchema.parse(await created.json());
        expect(quote.kind).toBe('estimate');
        expect(quote.quoteNumber).toMatch(/^QUO-2026-0001$/);
        expect(quote.expiryDate).toBe('2099-01-01');
        expect(quote.taxRate).toBe('15.00');
        expect(quote.subtotal).toBe('200.00');
        expect(quote.discount).toBe('20.00');
        expect(quote.taxAmount).toBe('27.00');
        expect(quote.additionalCharges).toBe('5.00');
        expect(quote.total).toBe('212.00');
        expect(await journalRows(db)).toEqual([]);

        const replay = await app.request('/api/quotes', {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': 'quote-create-1' },
          body: JSON.stringify({ ...exclusiveQuote, customerId: customer.id, kind: 'estimate' }),
        });
        expect(quoteSchema.parse(await replay.json()).id).toBe(quote.id);

        const invoiced = await app.request('/api/invoices', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: customer.id,
            date: exclusiveQuote.date,
            dueDate: '2026-11-05',
            taxInclusive: false,
            taxRate: '15',
            discountType: 'percent',
            discountPercent: '10',
            additionalChargesList: exclusiveQuote.additionalChargesList,
            items: exclusiveQuote.items,
          }),
        });
        const invoice = invoiceSchema.parse(await invoiced.json());
        expect(invoice.invoiceNumber).toMatch(/^INV-2026-0001$/);
        expect(invoice.subtotal).toBe(quote.subtotal);
        expect(invoice.taxAmount).toBe(quote.taxAmount);
        expect(invoice.discount).toBe(quote.discount);
        expect(invoice.additionalCharges).toBe(quote.additionalCharges);
        expect(invoice.total).toBe(quote.total);
        expect(invoice.items.map((item) => item.total)).toEqual(quote.items.map((item) => item.total));

        const inclusive = {
          customerId: customer.id,
          date: '2026-10-22',
          taxInclusive: true,
          taxRate: '15',
          discountType: 'percent' as const,
          discountPercent: '10',
          additionalChargesList: exclusiveQuote.additionalChargesList,
          items: [{ description: 'Goods', quantity: '1', rate: '115' }],
        };
        const inclusiveQuoteResponse = await app.request('/api/quotes', {
          method: 'POST', headers, body: JSON.stringify({ ...inclusive, expiryDate: '2099-01-01' }),
        });
        expect(inclusiveQuoteResponse.status).toBe(201);
        const inclusiveQuote = quoteSchema.parse(await inclusiveQuoteResponse.json());
        const inclusiveInvoice = invoiceSchema.parse(await (await app.request('/api/invoices', {
          method: 'POST', headers, body: JSON.stringify({ ...inclusive, dueDate: '2026-11-05' }),
        })).json());
        expect(inclusiveQuote.subtotal).toBe(inclusiveInvoice.subtotal);
        expect(inclusiveQuote.taxAmount).toBe(inclusiveInvoice.taxAmount);
        expect(inclusiveQuote.discount).toBe(inclusiveInvoice.discount);
        expect(inclusiveQuote.total).toBe(inclusiveInvoice.total);
        expect(inclusiveQuote.total).toBe('108.50');

        const nextQuote = await app.request('/api/quotes/next-number', { headers });
        const nextInvoice = await app.request('/api/invoices/next-number', { headers });
        expect((await nextQuote.json() as { quoteNumber: string }).quoteNumber).toMatch(/-0003$/);
        expect((await nextInvoice.json() as { invoiceNumber: string }).invoiceNumber).toMatch(/-0003$/);

        const hidden = await app.request(`/api/quotes/${quote.id}`, { headers: { Cookie: other.cookie } });
        expect(hidden.status).toBe(404);
        const invoices = await app.request('/api/invoices', { headers });
        const invoiceNumbers = ((await invoices.json()) as { invoices: { invoiceNumber: string }[] }).invoices.map((row) => row.invoiceNumber);
        expect(invoiceNumbers.every((number) => number.startsWith('INV-'))).toBe(true);
        const returns = await app.request('/api/tax-returns', { headers });
        expect((await returns.json() as { taxReturns: unknown[] }).taxReturns).toEqual([]);
      } finally {
        await close.end({ timeout: 5 });
      }
    });
  });

  it('rejects invalid quotes and edits only drafts', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql: close } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Validation Owner');
        const customer = await seedCustomerAndProfile(app, owner.cookie);
        const headers = { ...originHeaders, Cookie: owner.cookie };
        const post = (body: unknown) => app.request('/api/quotes', { method: 'POST', headers, body: JSON.stringify(body) });
        for (const body of [
          { customerId: customer.id, date: '2026-10-22', items: [] },
          { customerId: customer.id, date: '2026-10-22', expiryDate: '2026-10-01', items: [{ description: 'Labour', quantity: '1', rate: '10' }] },
          { customerId: customer.id, date: '2026-10-22', discountType: 'percent', discountPercent: '140', items: [{ description: 'Labour', quantity: '1', rate: '10' }] },
          { customerId: customer.id, date: '2026-10-22', discountType: 'fixed', discount: '50', items: [{ description: 'Labour', quantity: '1', rate: '10' }] },
        ]) {
          const response = await post(body);
          expect(response.status).toBe(400);
          expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
        }

        const created = quoteSchema.parse(await (await post({
          customerId: customer.id, date: '2026-10-22', items: [{ description: 'Labour', quantity: '1', rate: '80' }],
        })).json());
        expect(created.expiryDate).toBe(addCalendarDays('2026-10-22', 30));
        const patched = quoteSchema.parse(await (await app.request(`/api/quotes/${created.id}`, {
          method: 'PATCH', headers, body: JSON.stringify({ notes: 'Site visit', items: [{ description: 'Labour', quantity: '2', rate: '80' }] }),
        })).json());
        expect(patched.notes).toBe('Site visit');
        expect(patched.total).not.toBe(created.total);

        await app.request(`/api/quotes/${created.id}/mark-sent`, { method: 'POST', headers });
        const locked = await app.request(`/api/quotes/${created.id}`, {
          method: 'PATCH', headers, body: JSON.stringify({ notes: 'changed' }),
        });
        expect(locked.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await locked.json()).error.code).toBe('QUOTE_NOT_EDITABLE');
        const removed = await app.request(`/api/quotes/${created.id}`, { method: 'DELETE', headers });
        expect(removed.status).toBe(409);
      } finally {
        await close.end({ timeout: 5 });
      }
    });
  });

  it('follows the status table, expires on read, and lets a client respond once', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql: close } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true, invoiceMailer: createUnavailableInvoiceMailer() });
        const owner = await signUp(app, 'Lifecycle Owner');
        const customer = await seedCustomerAndProfile(app, owner.cookie);
        const headers = { ...originHeaders, Cookie: owner.cookie };
        const create = async (body: Record<string, unknown>) => quoteSchema.parse(await (await app.request('/api/quotes', {
          method: 'POST', headers, body: JSON.stringify({ customerId: customer.id, items: [{ description: 'Labour', quantity: '1', rate: '50' }], ...body }),
        })).json());

        const live = await create({ date: '2026-10-22', expiryDate: '2099-01-01' });
        const earlyAccept = await app.request(`/api/quotes/${live.id}/status`, {
          method: 'POST', headers, body: JSON.stringify({ status: 'accepted', name: 'Owner' }),
        });
        expect(earlyAccept.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await earlyAccept.json()).error.message).toContain('draft');

        const unsent = await app.request(`/api/quotes/${live.id}/send`, { method: 'POST', headers, body: JSON.stringify({}) });
        expect(unsent.status).toBe(503);
        expect(errorEnvelopeSchema.parse(await unsent.json()).error.code).toBe('EMAIL_UNAVAILABLE');
        expect(quoteSchema.parse(await (await app.request(`/api/quotes/${live.id}`, { headers })).json()).status).toBe('draft');

        const share = await app.request(`/api/quotes/${live.id}/share`, { method: 'POST', headers, body: JSON.stringify({ templateName: 'classic' }) });
        expect(share.status).toBe(201);
        const shared = (await share.json()) as { shareToken: string; revision: number };
        expect(shared.shareToken).toMatch(/^[0-9a-f-]{36}_[0-9a-f-]{36}$/);

        const renamed = await app.request(`/api/customers/${customer.id}`, {
          method: 'PATCH', headers, body: JSON.stringify({ name: 'Renamed Cafe' }),
        });
        expect(renamed.status).toBe(200);

        const viewed = await app.request(`/api/public/quotes/${shared.shareToken}`);
        expect(viewed.status).toBe(200);
        const publicBody = await viewed.json() as { status: string; expiryDate: string; templateName: string; businessProfile: { name: string }; quote: { status: string; customerName: string | null; total: string } };
        expect(publicBody.status).toBe('viewed');
        expect(publicBody.quote.status).toBe('viewed');
        expect(publicBody.quote.customerName).toBe('North Harbour Cafe');
        const ownerQuote = quoteSchema.parse(await (await app.request(`/api/quotes/${live.id}`, { headers })).json());
        expect(ownerQuote.customerName).toBe('Renamed Cafe');
        expect(publicBody.quote.total).toBe(ownerQuote.total);
        expect(publicBody.expiryDate).toBe('2099-01-01');
        expect(publicBody.templateName).toBe('classic');
        expect(publicBody.businessProfile.name).toBe('Kauri Studio Ltd');
        expect(await journalRows(db)).toEqual([]);

        const missingName = await app.request(`/api/public/quotes/${shared.shareToken}/respond`, {
          method: 'POST', headers: originHeaders, body: JSON.stringify({ action: 'accept', note: 'ok' }),
        });
        expect(missingName.status).toBe(400);
        const huge = await app.request(`/api/public/quotes/${shared.shareToken}/respond`, {
          method: 'POST', headers: originHeaders, body: JSON.stringify({ action: 'accept', name: 'A'.repeat(121) }),
        });
        expect(huge.status).toBe(400);

        const accepted = await app.request(`/api/public/quotes/${shared.shareToken}/respond`, {
          method: 'POST', headers: originHeaders, body: JSON.stringify({ action: 'accept', name: 'Alex Ngata', note: 'Go ahead' }),
        });
        expect(accepted.status).toBe(200);
        expect(await accepted.json()).toMatchObject({ action: 'accept', name: 'Alex Ngata', note: 'Go ahead' });
        const again = await app.request(`/api/public/quotes/${shared.shareToken}/respond`, {
          method: 'POST', headers: originHeaders, body: JSON.stringify({ action: 'decline', name: 'Someone Else' }),
        });
        expect(again.status).toBe(409);
        const againBody = await again.json() as { error: { code: string }; response: { name: string } };
        expect(againBody.error.code).toBe('QUOTE_ALREADY_RESPONDED');
        expect(againBody.response.name).toBe('Alex Ngata');

        const declined = await create({ date: '2026-10-22', expiryDate: '2099-01-01' });
        await app.request(`/api/quotes/${declined.id}/mark-sent`, { method: 'POST', headers });
        const declinedShare = (await (await app.request(`/api/quotes/${declined.id}/share`, { method: 'POST', headers, body: '{}' })).json()) as { shareToken: string };
        await app.request(`/api/public/quotes/${declinedShare.shareToken}`);
        const decline = await app.request(`/api/public/quotes/${declinedShare.shareToken}/respond`, {
          method: 'POST', headers: originHeaders, body: JSON.stringify({ action: 'decline', name: 'José Ngata', note: 'Merci' }),
        });
        expect(decline.status).toBe(200);
        expect(await decline.json()).toMatchObject({ action: 'decline', name: 'José Ngata', note: 'Merci' });
        const revised = quoteSchema.parse(await (await app.request(`/api/quotes/${declined.id}/revise`, { method: 'POST', headers })).json());
        expect(revised.status).toBe('draft');
        expect(revised.revision).toBe(2);
        const revoked = await app.request(`/api/public/quotes/${declinedShare.shareToken}/respond`, {
          method: 'POST', headers: originHeaders, body: JSON.stringify({ action: 'accept', name: 'Alex Ngata' }),
        });
        expect(revoked.status).toBe(410);
        expect(errorEnvelopeSchema.parse(await revoked.json()).error.code).toBe('QUOTE_LINK_REVOKED');
        const revokedRead = await app.request(`/api/public/quotes/${declinedShare.shareToken}`);
        expect(revokedRead.status).toBe(410);

        const stale = await create({ date: '2020-01-01', expiryDate: '2020-02-01' });
        await app.request(`/api/quotes/${stale.id}/mark-sent`, { method: 'POST', headers });
        const expired = quoteSchema.parse(await (await app.request(`/api/quotes/${stale.id}`, { headers })).json());
        expect(expired.status).toBe('expired');
        const listed = await app.request('/api/quotes?status=expired', { headers });
        const expiredIds = ((await listed.json()) as { quotes: { id: string }[] }).quotes.map((row) => row.id);
        expect(expiredIds).toContain(stale.id);
        const tooLate = await app.request(`/api/quotes/${stale.id}/status`, {
          method: 'POST', headers, body: JSON.stringify({ status: 'accepted', name: 'Owner' }),
        });
        expect(tooLate.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await tooLate.json()).error.code).toBe('QUOTE_EXPIRED');
        const staleShare = (await (await app.request(`/api/quotes/${stale.id}/share`, { method: 'POST', headers, body: '{}' })).json()) as { shareToken: string };
        const publicExpired = await app.request(`/api/public/quotes/${staleShare.shareToken}/respond`, {
          method: 'POST', headers: originHeaders, body: JSON.stringify({ action: 'accept', name: 'Alex Ngata' }),
        });
        expect(publicExpired.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await publicExpired.json()).error.code).toBe('QUOTE_EXPIRED');

        const foreignToken = `22222222-2222-4222-8222-222222222222_${staleShare.shareToken.split('_')[1]}`;
        const foreign = await app.request(`/api/public/quotes/${foreignToken}`);
        expect(foreign.status).toBe(404);

        const copy = quoteSchema.parse(await (await app.request(`/api/quotes/${live.id}/duplicate`, { method: 'POST', headers })).json());
        expect(copy.status).toBe('draft');
        expect(copy.id).not.toBe(live.id);
        expect(copy.quoteNumber).not.toBe(live.quoteNumber);
        expect(copy.date).toBe(aucklandToday());
        expect(copy.total).toBe(live.total);
      } finally {
        await close.end({ timeout: 5 });
      }
    });
  });

  it('rejects an oversized public response by byte length', async () => {
    const app = createApp();
    const tooManyChars = await app.request('/api/public/quotes/not-a-token/respond', {
      method: 'POST',
      headers: originHeaders,
      body: 'é'.repeat(4096),
    });
    expect(tooManyChars.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await tooManyChars.json()).error.message).toBe('Response is too large');

    const withinBytes = await app.request('/api/public/quotes/not-a-token/respond', {
      method: 'POST',
      headers: originHeaders,
      body: 'é'.repeat(2048),
    });
    expect(withinBytes.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await withinBytes.json()).error.message).toBe('Response must be JSON');

    let pulled = 0;
    const chunked = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1000));
        if (pulled > 20) controller.error(new Error('read past the cap'));
      },
    });
    const streamed = await app.request(new Request('http://localhost/api/public/quotes/not-a-token/respond', {
      method: 'POST',
      headers: originHeaders,
      body: chunked,
      duplex: 'half',
    } as RequestInit));
    expect(streamed.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await streamed.json()).error.message).toBe('Response is too large');
    expect(pulled).toBeLessThanOrEqual(6);

    let declaredPulls = 0;
    const declaredBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        declaredPulls += 1;
        controller.enqueue(new Uint8Array(100));
        controller.close();
      },
    });
    const declared = await app.request(new Request('http://localhost/api/public/quotes/not-a-token/respond', {
      method: 'POST',
      headers: { ...originHeaders, 'Content-Length': '8192' },
      body: declaredBody,
      duplex: 'half',
    } as RequestInit));
    expect(declared.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await declared.json()).error.message).toBe('Response is too large');
    // Undici prefetches one chunk when the Request is constructed. The handler
    // rejects from Content-Length and does not read that chunk or pull another.
    expect(declaredPulls).toBeLessThanOrEqual(1);
  });

  it('converts a quote priced from a tax rate and percent discount that are not already at 2 decimal places', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql: close } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Fraction Owner');
        const customer = await seedCustomerAndProfile(app, owner.cookie);
        const headers = { ...originHeaders, Cookie: owner.cookie };
        const created = quoteSchema.parse(await (await app.request('/api/quotes', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-10-22',
            expiryDate: '2099-01-01',
            taxInclusive: false,
            taxRate: '12.345',
            discountType: 'percent',
            discountPercent: '7.777',
            items: [{ description: 'Labour', quantity: '1', rate: '100' }],
          }),
        })).json());
        expect(created.taxRate).toBe('12.35');
        expect(created.discountPercent).toBe('7.78');
        expect(created.subtotal).toBe('100.00');
        expect(created.discount).toBe('7.78');
        expect(created.taxAmount).toBe('11.39');
        expect(created.total).toBe('103.61');

        await app.request('/api/business-profile', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: 'Kauri Studio Ltd',
            email: 'hello@kauristudio.nz',
            defaultTaxRate: '0',
            paymentTermDays: 14,
          }),
        });
        await app.request(`/api/quotes/${created.id}/mark-sent`, { method: 'POST', headers });
        await app.request(`/api/quotes/${created.id}/status`, {
          method: 'POST', headers, body: JSON.stringify({ status: 'accepted', name: 'Owner' }),
        });
        const converted = await app.request(`/api/quotes/${created.id}/convert`, { method: 'POST', headers });
        expect(converted.status).toBe(200);
        const body = await converted.json() as { invoice: { subtotal: string; taxAmount: string; discount: string | null; total: string; sourceQuoteId?: string } };
        expect(body.invoice.subtotal).toBe(created.subtotal);
        expect(body.invoice.taxAmount).toBe(created.taxAmount);
        expect(body.invoice.discount).toBe(created.discount);
        expect(body.invoice.total).toBe(created.total);
        expect(body.invoice.sourceQuoteId).toBe(created.id);
      } finally {
        await close.end({ timeout: 5 });
      }
    });
  });

  it('converts an accepted quote once into a draft invoice with the same totals', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql: close } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Convert Owner');
        const customer = await seedCustomerAndProfile(app, owner.cookie, 21);
        const headers = { ...originHeaders, Cookie: owner.cookie };
        const created = quoteSchema.parse(await (await app.request('/api/quotes', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: customer.id,
            ...exclusiveQuote,
            taxInclusive: true,
            items: [{ description: 'Goods', quantity: '1', rate: '115' }],
          }),
        })).json());
        const blocked = await app.request(`/api/quotes/${created.id}/convert`, { method: 'POST', headers });
        expect(blocked.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await blocked.json()).error.message).toContain('draft');
        expect(await journalRows(db)).toEqual([]);

        await app.request('/api/business-profile', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: 'Kauri Studio Ltd',
            email: 'hello@kauristudio.nz',
            defaultTaxRate: '0',
            paymentTermDays: 21,
          }),
        });
        await app.request(`/api/quotes/${created.id}/mark-sent`, { method: 'POST', headers });
        await app.request(`/api/quotes/${created.id}/status`, {
          method: 'POST', headers, body: JSON.stringify({ status: 'accepted', name: 'Owner' }),
        });

        const first = await app.request(`/api/quotes/${created.id}/convert`, {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': 'convert-1' },
        });
        expect(first.status).toBe(200);
        const converted = await first.json() as { quote: { status: string; convertedInvoiceId: string; total: string }; invoice: { id: string; date: string; dueDate: string; total: string; subtotal: string; taxAmount: string; discount: string | null; sourceQuoteId?: string; sourceQuoteNumber?: string; invoiceNumber: string } };
        const today = aucklandToday();
        expect(converted.quote.status).toBe('converted');
        expect(converted.invoice.date).toBe(today);
        expect(converted.invoice.dueDate).toBe(addCalendarDays(today, 21));
        expect(converted.invoice.invoiceNumber.startsWith('INV-')).toBe(true);
        expect(converted.invoice.subtotal).toBe(created.subtotal);
        expect(converted.invoice.taxAmount).toBe(created.taxAmount);
        expect(converted.invoice.discount).toBe(created.discount);
        expect(converted.invoice.total).toBe(created.total);
        expect(converted.invoice.sourceQuoteId).toBe(created.id);
        expect(converted.invoice.sourceQuoteNumber).toBe(created.quoteNumber);

        const replay = await app.request(`/api/quotes/${created.id}/convert`, {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': 'convert-1' },
        });
        expect((await replay.json() as { invoice: { id: string } }).invoice.id).toBe(converted.invoice.id);
        const second = await app.request(`/api/quotes/${created.id}/convert`, { method: 'POST', headers });
        expect((await second.json() as { invoice: { id: string } }).invoice.id).toBe(converted.invoice.id);

        const listed = (await (await app.request('/api/invoices', { headers })).json()) as { invoices: { id: string }[] };
        expect(listed.invoices).toHaveLength(1);
        const journals = await journalRows(db);
        expect(journals).toHaveLength(1);
        expect(journals[0]?.reference_type).toBe('invoice');
        expect(journals[0]?.reference_id).toBe(converted.invoice.id);
        expect(journals[0]?.description).toContain(converted.invoice.invoiceNumber);
        expect(journals[0]?.description).not.toContain(created.quoteNumber);
        const lines = await db.execute<{ description: string }>(sql`SELECT description FROM journal_entry_lines`);
        expect(lines.some((line) => line.description.includes('GST'))).toBe(true);
        expect(lines.every((line) => !line.description.includes(created.quoteNumber))).toBe(true);

        const declined = quoteSchema.parse(await (await app.request('/api/quotes', {
          method: 'POST', headers, body: JSON.stringify({ customerId: customer.id, date: '2026-10-22', expiryDate: '2099-01-01', items: [{ description: 'Labour', quantity: '1', rate: '10' }] }),
        })).json());
        await app.request(`/api/quotes/${declined.id}/mark-sent`, { method: 'POST', headers });
        await app.request(`/api/quotes/${declined.id}/status`, { method: 'POST', headers, body: JSON.stringify({ status: 'declined' }) });
        const declineConvert = await app.request(`/api/quotes/${declined.id}/convert`, { method: 'POST', headers });
        expect(declineConvert.status).toBe(409);

        const old = quoteSchema.parse(await (await app.request('/api/quotes', {
          method: 'POST', headers, body: JSON.stringify({ customerId: customer.id, date: '2020-01-01', expiryDate: '2020-02-01', items: [{ description: 'Labour', quantity: '1', rate: '10' }] }),
        })).json());
        await app.request(`/api/quotes/${old.id}/mark-sent`, { method: 'POST', headers });
        const expiredConvert = await app.request(`/api/quotes/${old.id}/convert`, { method: 'POST', headers });
        expect(expiredConvert.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await expiredConvert.json()).error.message).toContain('expired');
      } finally {
        await close.end({ timeout: 5 });
      }
    });
  });
});
