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

async function seedCustomerAndProfile(app: ReturnType<typeof createApp>, cookie: string) {
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

describe('invoice reminder routes', () => {
  it('sends a reminder without changing invoice status and isolates organisations', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const mailer: InvoiceMailer = {
          sendInvoice: vi.fn().mockResolvedValue(undefined),
          sendReminder: vi.fn().mockResolvedValue(undefined),
        };
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true, invoiceMailer: mailer });
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
            items: [{ description: 'Design', quantity: '1', rate: '100' }],
          }),
        });
        expect(created.status).toBe(201);
        const invoice = invoiceSchema.parse(await created.json());
        expect(invoice.status).toBe('draft');

        const reminded = await app.request(`/api/invoices/${invoice.id}/remind`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            subject: 'Payment reminder',
            html: '<p>Please pay</p>',
            reminderType: 'gentle',
            daysPastDue: 3,
          }),
        });
        expect(reminded.status).toBe(200);
        const after = invoiceSchema.parse(await reminded.json());
        expect(after.status).toBe('draft');
        expect(mailer.sendReminder).toHaveBeenCalledTimes(1);
        expect(mailer.sendInvoice).not.toHaveBeenCalled();

        const hidden = await app.request(`/api/invoices/${invoice.id}/remind`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerB.cookie },
          body: JSON.stringify({ subject: 'Nope', html: '<p>nope</p>' }),
        });
        expect(hidden.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await hidden.json()).error.code).toBe('NOT_FOUND');
      } finally {
        await sql.end();
      }
    });
  });
});
