import { describe, expect, it } from 'vitest';
import type { BankTransactionDto, BillPaymentBatchDto, FinancialReportResponse } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
describe('matching an already recorded supplier instalment', () => {
  it('matches the actual69 payment without changing AP276/profit/GST, retries, rejects reuse, and undoes only its correction', async () => withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
      const signUp = async () => {
        const response = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Supplier accountant', email: `${crypto.randomUUID()}@example.test`, password: 'Local-password123' }) });
        expect(response.status).toBe(200);
        return response.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
      };
      const cookie = await signUp();
      const request = async <T = Record<string, unknown>>(path: string, method: string, body?: unknown, expected = 200, actor = cookie) => {
        const response = await app.request(path, { method, headers: { ...headers, Cookie: actor }, body: body === undefined ? undefined : JSON.stringify(body) });
        const value = await response.json();
        expect(response.status, JSON.stringify(value)).toBe(expected);
        return value as T;
      };
      const bank = await request('/api/bank-accounts', 'POST', { accountName: 'Operating', accountNumber: crypto.randomUUID(), bankName: 'Test Bank', accountType: 'checking' }, 201);
      const cost = await request('/api/accounts', 'POST', { name: 'Operating costs', accountNumber: '5300', type: 'expense', accountClass: 'expense' }, 201);
      const vendor = await request('/api/vendors', 'POST', { name: 'Subcontractor' }, 201);
      const bill = await request('/api/bills', 'POST', { vendorId: vendor.id, issueDate: '2026-10-10', dueDate: '2026-11-10', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Subcontracting', quantity: '1', unitPrice: '345', taxRate: '15', accountId: cost.id }] }, 201);
      await request(`/api/bills/${bill.id}/receive`, 'POST', {});
      const paid = (await request<BillPaymentBatchDto>(`/api/bills/${bill.id}/payments`, 'POST', { bankAccountId: bank.id, amount: '69', paymentDate: '2026-10-20' }, 201)).payments[0];
      const before = await request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      const imported = await request<{ transactions: BankTransactionDto[] }>('/api/bank-transactions/import', 'POST', { bankAccountId: bank.id, transactions: [{ transactionDate: '2026-10-20', amount: '69', type: 'debit', description: 'Subcontractor instalment' }] }, 201);
      const transaction = imported.transactions[0];
      const session = await request('/api/reconciliation-sessions', 'POST', { bankAccountId: bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '-69' }, 201);
      const input = { bankTransactionId: transaction.id, bookItemType: 'bill_payment', bookItemId: paid.id, status: 'confirmed' };
      const saved = await request(`/api/reconciliation-sessions/${session.id}/matches`, 'POST', input, 201);
      expect(saved).toMatchObject({ billPaymentId: paid.id, paymentId: null, billId: null, bankAmount: '69.00', bookAmount: '69.00', difference: '0.00', status: 'confirmed' });
      const after = await request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      expect(after.balanceSheet.balanced).toBe(true);
      expect(after.profitLoss).toMatchObject({ revenue: '0.00', expenses: '300.00', netIncome: '-300.00' });
      expect(after.cashFlow.closingCash).toBe('-69.00');
      expect(after.taxSummary).toMatchObject({ outputGst: '0.00', inputGst: '45.00', netGst: '-45.00' });
      expect(after.profitLoss.revenue).toBe(before.profitLoss.revenue);
      expect(after.profitLoss.expenses).toBe(before.profitLoss.expenses);
      expect(after.profitLoss.netIncome).toBe(before.profitLoss.netIncome);
      expect(after.profitLoss.rows.find((row) => row.accountNumber === '5000')?.balance).toBe('0.00');
      expect(after.taxSummary.outputGst).toBe(before.taxSummary.outputGst);
      expect(after.taxSummary.inputGst).toBe(before.taxSummary.inputGst);
      expect(after.taxSummary.netGst).toBe(before.taxSummary.netGst);
      expect(after.balanceSheet.assets).toEqual(before.balanceSheet.assets);
      expect((await request(`/api/bills/${bill.id}`, 'GET')).balanceDue).toBe('276.00');
      expect((await request(`/api/reconciliation-sessions/${session.id}/matches`, 'POST', input, 201)).id).toBe(saved.id);
      const otherRow = (await request<{ transactions: BankTransactionDto[] }>('/api/bank-transactions/import', 'POST', { bankAccountId: bank.id, transactions: [{ transactionDate: '2026-10-21', amount: '69', type: 'debit', description: 'Other transfer' }] }, 201)).transactions[0];
      await request(`/api/reconciliation-sessions/${session.id}/matches`, 'POST', { ...input, bankTransactionId: otherRow.id }, 409);
      const outsider = await signUp();
      await request(`/api/reconciliation-sessions/${session.id}/matches`, 'POST', input, 404, outsider);
      await request(`/api/bank-transactions/${transaction.id}/undo`, 'POST', { reason: 'Check imported reference', reversalDate: '2026-10-22' });
      expect((await sql.unsafe('SELECT status FROM bill_payments WHERE id=?', [paid.id]))[0]?.status).toBe('completed');
      expect((await request(`/api/bills/${bill.id}`, 'GET')).balanceDue).toBe('276.00');
      const again = await request(`/api/reconciliation-sessions/${session.id}/matches`, 'POST', input, 201);
      expect(again.id).not.toBe(saved.id);
      const entries = await request('/api/book-entries?from=2026-10-01&to=2026-10-31', 'GET');
      expect(entries.entries).toEqual(expect.arrayContaining([expect.objectContaining({ id: paid.id, type: 'bill_payment', amount: '69.00' })]));
    } finally { await sql.end({ timeout: 5 }); }
  }));
});
