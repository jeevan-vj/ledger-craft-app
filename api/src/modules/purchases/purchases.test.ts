import {
  billListResponseSchema,
  billPaymentSchema,
  billSchema,
  errorEnvelopeSchema,
  vendorListResponseSchema,
  vendorSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`,
      password: 'password123',
    }),
  });
  expect(response.status).toBeLessThan(400);
  return cookieHeader(response);
}

describe('purchase routes', () => {
  it('protects the purchase directory', async () => {
    const response = await createApp().request('/api/vendors');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('creates, receives, pays and isolates a bill with balanced journals', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Purchase Owner A');
        const ownerB = await signUp(app, 'Purchase Owner B');

        const accountResponse = await app.request('/api/accounts', {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({
            name: 'Office expenses',
            type: 'expense',
            accountNumber: '6100',
            accountClass: 'expense',
          }),
        });
        const expenseAccount = await accountResponse.json() as { id: string };

        const bankResponse = await app.request('/api/bank-accounts', {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({
            accountName: 'Business cheque',
            accountNumber: '12-3456-7890123-00',
            bankName: 'ANZ',
            accountType: 'checking',
          }),
        });
        const bankAccount = await bankResponse.json() as { id: string };

        const vendorResponse = await app.request('/api/vendors', {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ name: 'Harbour Office Supplies', paymentTermDays: 20 }),
        });
        expect(vendorResponse.status).toBe(201);
        const vendor = vendorSchema.parse(await vendorResponse.json());

        const billResponse = await app.request('/api/bills', {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({
            vendorId: vendor.id,
            vendorReference: 'HS-1042',
            issueDate: '2026-10-03',
            dueDate: '2026-10-23',
            taxInclusive: true,
            lines: [{
              description: 'Printer paper',
              quantity: '2',
              unitPrice: '11.50',
              taxRate: '15',
              accountId: expenseAccount.id,
            }],
          }),
        });
        expect(billResponse.status).toBe(201);
        const draft = billSchema.parse(await billResponse.json());
        expect(draft).toMatchObject({
          billNumber: 'BILL-0001',
          lifecycleStatus: 'draft',
          subtotal: '20.00',
          taxAmount: '3.00',
          total: '23.00',
          balanceDue: '23.00',
        });

        const receivedResponse = await app.request(`/api/bills/${draft.id}/receive`, {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
        });
        expect(receivedResponse.status).toBe(200);
        expect(billSchema.parse(await receivedResponse.json()).lifecycleStatus).toBe('received');

        const entries = await sql.unsafe(
          `SELECT reference_type, reference_id, total_amount FROM journal_entries
           WHERE reference_type = 'bill' AND reference_id = ?`,
          [draft.id],
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]?.total_amount).toBe('23.00');
        const totals = await sql.unsafe(
          `SELECT debit_amount, credit_amount FROM journal_entry_lines
           WHERE journal_entry_id = (SELECT id FROM journal_entries WHERE reference_type = 'bill' AND reference_id = ?)`,
          [draft.id],
        );
        const debit = totals.reduce((sum, row) => sum + Number(row.debit_amount), 0);
        const credit = totals.reduce((sum, row) => sum + Number(row.credit_amount), 0);
        expect(debit).toBe(credit);
        expect(debit).toBe(23);

        const paymentResponse = await app.request(`/api/bills/${draft.id}/payments`, {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({
            bankAccountId: bankAccount.id,
            amount: '5.00',
            paymentDate: '2026-10-04',
          }),
        });
        expect(paymentResponse.status).toBe(201);
        expect(billPaymentSchema.parse(await paymentResponse.json()).amount).toBe('5.00');
        const paidBill = billSchema.parse(
          await (await app.request(`/api/bills/${draft.id}`, { headers: { Cookie: ownerA } })).json(),
        );
        expect(paidBill).toMatchObject({ paymentStatus: 'partial', totalPaid: '5.00', balanceDue: '18.00' });

        const overpayment = await app.request(`/api/bills/${draft.id}/payments`, {
          method: 'POST',
          headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ bankAccountId: bankAccount.id, amount: '100.00', paymentDate: '2026-10-04' }),
        });
        expect(overpayment.status).toBe(400);

        const vendorsB = vendorListResponseSchema.parse(
          await (await app.request('/api/vendors', { headers: { Cookie: ownerB } })).json(),
        );
        expect(vendorsB.vendors).toEqual([]);
        const billsB = billListResponseSchema.parse(
          await (await app.request('/api/bills', { headers: { Cookie: ownerB } })).json(),
        );
        expect(billsB.bills).toEqual([]);
        expect((await app.request(`/api/bills/${draft.id}`, { headers: { Cookie: ownerB } })).status).toBe(404);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
