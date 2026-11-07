import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
describe('bank workspace preferences and movements', () => {
  it('persists an owned default and returns exact historical movement balances without changing books', async () => withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const app = createApp({ db, auth: createAuth(db) });
      const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Bank owner', email: `${crypto.randomUUID()}@example.test`, password: 'Local-bank-pass123!' }) });
      const cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const h = { ...headers, Cookie: cookie };
      const initial = await app.request('/api/bank-default-account', { headers: h });
      expect(initial.status).toBe(200); expect(await initial.json()).toEqual({ bankAccountId: null });
      const post = async (path: string, body: unknown) => {
        const response = await app.request(path, { method: 'POST', headers: h, body: JSON.stringify(body) });
        expect(response.status).toBe(201); return response.json() as Promise<{ id: string }>;
      };
      const account = await post('/api/bank-accounts', { accountName: 'Working account', accountNumber: 'bank-test', bankName: 'Test', accountType: 'checking', openingBalance: '100.10' });
      await post('/api/bank-accounts', { accountName: 'AAA alternate', accountNumber: 'other-bank', bankName: 'Test', accountType: 'checking' });
      const chosen = await app.request('/api/bank-default-account', { method: 'PUT', headers: h, body: JSON.stringify({ bankAccountId: account.id }) });
      expect(chosen.status).toBe(200); expect(await chosen.json()).toEqual({ bankAccountId: account.id });
      expect(await (await app.request('/api/bank-default-account', { headers: h })).json()).toEqual({ bankAccountId: account.id });
      for (const [date, amount, type] of [['2026-10-01', '0.20', 'credit'], ['2026-10-10', '10.30', 'credit'], ['2026-10-11', '0.10', 'debit'], ['2026-11-01', '5.00', 'credit']]) {
        await post('/api/bank-transactions', { bankAccountId: account.id, transactionDate: date, amount, type, description: 'Reference bank movement' });
      }
      const summary = await app.request(`/api/bank-accounts/${account.id}/movements?from=2026-10-10&to=2026-10-31`, { headers: h });
      expect(summary.status).toBe(200); expect(await summary.json()).toMatchObject({ openingBalance: '100.30', inflows: '10.30', outflows: '0.10', movement: '10.20', closingBalance: '110.50' });
      const customer = await post('/api/customers', { name: 'Customer', email: 'buyer@example.test' });
      const invoice = await post('/api/invoices', { customerId: customer.id, date: '2026-10-15', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '0', items: [{ description: 'Test sale', quantity: '1', rate: '100' }] });
      const payment = await post('/api/payments', { invoiceId: invoice.id, amount: '100.00', paymentMethod: 'bank_transfer', paymentDate: '2026-10-15' });
      const posting = await sql`SELECT a.account_number FROM journal_entry_lines l JOIN journal_entries j ON j.id = l.journal_entry_id JOIN accounts a ON a.id = l.account_id WHERE j.reference_id = ${payment.id} AND l.debit_amount = '100.00'`;
      expect(posting[0].account_number).toBe(`BANK-${account.id.slice(0, 8).toUpperCase()}`);
      const bad = await app.request('/api/bank-default-account', { method: 'PUT', headers: h, body: JSON.stringify({ bankAccountId: crypto.randomUUID() }) });
      expect(bad.status).toBe(404);
      const deactivate = await app.request(`/api/bank-accounts/${account.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ isActive: false }) });
      expect(deactivate.status).toBe(409);
      const cleared = await app.request('/api/bank-default-account', { method: 'PUT', headers: h, body: JSON.stringify({ bankAccountId: null }) });
      expect(cleared.status).toBe(200);
    } finally { await sql.end({ timeout: 5 }); }
  }));
});
