import {
  errorEnvelopeSchema,
  invoiceSchema,
  paymentReceiptListResponseSchema,
  paymentReceiptSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';

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

async function seedPaidInvoice(app: ReturnType<typeof createApp>, cookie: string) {
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
  const customerId = ((await customer.json()) as { id: string }).id;
  const created = await app.request('/api/invoices', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      customerId,
      date: '2026-09-08',
      dueDate: '2026-10-08',
      taxInclusive: false,
      taxRate: '15',
      items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
    }),
  });
  expect(created.status).toBe(201);
  const invoice = invoiceSchema.parse(await created.json());
  const paid = await app.request('/api/payments', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      invoiceId: invoice.id,
      paymentMethod: 'bank_transfer',
      amount: invoice.total,
      paymentDate: '2026-09-08',
    }),
  });
  expect(paid.status).toBe(201);
  return { invoice, payment: (await paid.json()) as { id: string } };
}

async function createPaidInvoice(app: ReturnType<typeof createApp>, cookie: string) {
  const customer = await app.request('/api/customers', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'South Harbour Cafe', email: 'hello@shcafe.nz', country: 'NZ' }),
  });
  expect(customer.status).toBe(201);
  const customerId = ((await customer.json()) as { id: string }).id;
  const created = await app.request('/api/invoices', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      customerId,
      date: '2026-09-09',
      dueDate: '2026-10-09',
      taxInclusive: false,
      taxRate: '15',
      items: [{ description: 'Follow-up identity', quantity: '1', rate: '1200' }],
    }),
  });
  expect(created.status).toBe(201);
  const invoice = invoiceSchema.parse(await created.json());
  const paid = await app.request('/api/payments', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      invoiceId: invoice.id,
      paymentMethod: 'cash',
      amount: invoice.total,
      paymentDate: '2026-09-09',
    }),
  });
  expect(paid.status).toBe(201);
  return { invoice, payment: (await paid.json()) as { id: string } };
}

describe('receipt routes', () => {
  it('unauthenticated GET /api/receipts returns 401', async () => {
    const response = await createApp().request('/api/receipts');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('creates a payment receipt and isolates it by organisation', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');
        const { payment } = await seedPaidInvoice(app, ownerA.cookie);

        const ownership = await app.request('/api/receipts', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            paymentId: payment.id,
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const created = await app.request('/api/receipts', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ paymentId: payment.id }),
        });
        expect(created.status).toBe(201);
        const receipt = paymentReceiptSchema.parse(await created.json());
        expect(receipt.paymentId).toBe(payment.id);
        expect(receipt.receiptNumber).toMatch(/^REC-\d{6}-\d{4}$/);
        expect(receipt.receiptData).toMatchObject({
          paymentId: payment.id,
          invoiceId: expect.any(String),
          invoiceNumber: expect.any(String),
          customerName: 'North Harbour Cafe',
          customerEmail: 'hello@nhcafe.nz',
          amountPaid: expect.any(String),
          invoiceDate: expect.any(String),
          invoiceDueDate: expect.any(String),
          currency: 'NZD',
          balanceDue: '0.00',
        });

        const listed = await app.request('/api/receipts', { headers: { Cookie: ownerA.cookie } });
        expect(listed.status).toBe(200);
        const body = (await listed.json()) as { receipts: unknown[] };
        expect(body.receipts).toHaveLength(1);

        const hidden = await app.request(`/api/receipts/${receipt.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(hidden.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await hidden.json()).error.code).toBe('NOT_FOUND');
      } finally {
        await sql.end();
      }
    });
  });

  it('filters receipts by payment and invoice inside the organisation', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Receipt Filter A');
        const ownerB = await signUp(app, 'Receipt Filter B');
        const first = await seedPaidInvoice(app, ownerA.cookie);
        const second = await createPaidInvoice(app, ownerA.cookie);
        const foreign = await seedPaidInvoice(app, ownerB.cookie);

        const createReceipt = async (cookie: string, paymentId: string) => {
          const response = await app.request('/api/receipts', {
            method: 'POST',
            headers: { ...originHeaders, Cookie: cookie },
            body: JSON.stringify({ paymentId }),
          });
          expect(response.status).toBe(201);
          return paymentReceiptSchema.parse(await response.json());
        };
        const receiptA = await createReceipt(ownerA.cookie, first.payment.id);
        const receiptB = await createReceipt(ownerA.cookie, second.payment.id);
        const receiptForeign = await createReceipt(ownerB.cookie, foreign.payment.id);

        const byPayment = paymentReceiptListResponseSchema.parse(
          await (
            await app.request(`/api/receipts?paymentId=${first.payment.id}`, {
              headers: { Cookie: ownerA.cookie },
            })
          ).json(),
        );
        expect(byPayment.receipts.map((receipt) => receipt.id)).toEqual([receiptA.id]);

        const byInvoice = paymentReceiptListResponseSchema.parse(
          await (
            await app.request(`/api/receipts?invoiceId=${second.invoice.id}`, {
              headers: { Cookie: ownerA.cookie },
            })
          ).json(),
        );
        expect(byInvoice.receipts.map((receipt) => receipt.id)).toEqual([receiptB.id]);
        expect(byInvoice.receipts[0]?.receiptData.invoiceId).toBe(second.invoice.id);

        const mismatched = paymentReceiptListResponseSchema.parse(
          await (
            await app.request(
              `/api/receipts?paymentId=${first.payment.id}&invoiceId=${second.invoice.id}`,
              { headers: { Cookie: ownerA.cookie } },
            )
          ).json(),
        );
        expect(mismatched.receipts).toEqual([]);

        const hiddenPayment = paymentReceiptListResponseSchema.parse(
          await (
            await app.request(`/api/receipts?paymentId=${first.payment.id}`, {
              headers: { Cookie: ownerB.cookie },
            })
          ).json(),
        );
        expect(hiddenPayment.receipts).toEqual([]);
        const hiddenInvoice = paymentReceiptListResponseSchema.parse(
          await (
            await app.request(`/api/receipts?invoiceId=${first.invoice.id}`, {
              headers: { Cookie: ownerB.cookie },
            })
          ).json(),
        );
        expect(hiddenInvoice.receipts).toEqual([]);
        const ownPayment = paymentReceiptListResponseSchema.parse(
          await (
            await app.request(`/api/receipts?paymentId=${foreign.payment.id}`, {
              headers: { Cookie: ownerB.cookie },
            })
          ).json(),
        );
        expect(ownPayment.receipts.map((receipt) => receipt.id)).toEqual([receiptForeign.id]);

        const invalid = await app.request('/api/receipts?paymentId=not-a-uuid', {
          headers: { Cookie: ownerA.cookie },
        });
        expect(invalid.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await invalid.json()).error.code).toBe('VALIDATION_ERROR');
      } finally {
        await sql.end();
      }
    });
  });
});
