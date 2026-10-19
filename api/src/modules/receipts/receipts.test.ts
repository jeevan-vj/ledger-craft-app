import { errorEnvelopeSchema, invoiceSchema, paymentReceiptSchema } from '@ledgercraft/contracts';
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
});
