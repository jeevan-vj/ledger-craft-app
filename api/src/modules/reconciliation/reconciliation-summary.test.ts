import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import type { BillPaymentBatchDto, ReconciliationSummaryDto } from '@ledgercraft/contracts';

async function supplierStatement() {
  const f = await settlementFixture();
  const bill = await f.request('/api/bills', 'POST', { vendorId: f.vendor.id, issueDate: '2026-10-10', dueDate: '2026-11-10', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Contracting', quantity: '1', unitPrice: '345', taxRate: '15', accountId: f.cost.id }] }, 201);
  await f.request(`/api/bills/${bill.id}/receive`, 'POST', {});
  const paid = (await f.request<BillPaymentBatchDto>(`/api/bills/${bill.id}/payments`, 'POST', { bankAccountId: f.bank.id, amount: '69', paymentDate: '2026-10-20' }, 201)).payments[0];
  const imported = await f.request<{ transactions: Array<{ id: string }> }>('/api/bank-transactions/import', 'POST', { bankAccountId: f.bank.id, transactions: [{ transactionDate: '2026-10-20', amount: '69', type: 'debit', description: 'Supplier instalment' }] }, 201);
  const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '-69' }, 201);
  await f.request(`/api/reconciliation-sessions/${session.id}/matches`, 'POST', { bankTransactionId: imported.transactions[0].id, bookItemType: 'bill_payment', bookItemId: paid.id, status: 'confirmed' }, 201);
  return { ...f, session };
}

describe('authoritative bank statement summary before completion', () => {
  it('shows the real posted minus69 before completion and agrees with the completed closing balance', async () => withTestDb(async () => {
    const f = await supplierStatement();
    try {
      const summary = await f.request<ReconciliationSummaryDto>(`/api/reconciliation-sessions/${f.session.id}/summary`, 'GET');
      expect(summary).toMatchObject({ bankBalance: '-69.00', bookBalance: '-69.00', adjustedBankBalance: '-69.00', adjustedBookBalance: '-69.00', finalDifference: '0.00', isReconciled: true });
      expect(summary.session).toMatchObject({ bookClosingBalance: null, status: 'in_progress' });
      const stored = await f.request(`/api/reconciliation-sessions/${f.session.id}`, 'GET');
      expect(stored.bookClosingBalance).toBe(null); // GET is a preview, not a mutation.
      const completed = await f.request(`/api/reconciliation-sessions/${f.session.id}/complete`, 'POST', {});
      expect(completed).toMatchObject({ bookClosingBalance: '-69.00', difference: '0.00', status: 'completed' });
      await f.request('/api/bank-transactions', 'POST', { bankAccountId: f.bank.id, transactionDate: '2026-11-05', amount: '999', type: 'credit', description: 'Next month activity' }, 201);
      expect(await f.request(`/api/reconciliation-sessions/${f.session.id}/summary`, 'GET')).toMatchObject({ bookBalance: '-69.00', finalDifference: '0.00', isReconciled: true });
      const other = await f.app.request('/api/auth/sign-up/email', { method: 'POST', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Other owner', email: `${crypto.randomUUID()}@example.test`, password: 'Local-password123' }) });
      const cookie = other.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
      expect((await f.app.request(`/api/reconciliation-sessions/${f.session.id}/summary`, { headers: { Cookie: cookie } })).status).toBe(404);
      expect((await f.app.request(`/api/reconciliation-sessions/${f.session.id}/summary`)).status).toBe(401);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('uses the same exact decimal adjustments as completion', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const bank = await f.request('/api/bank-accounts', 'POST', { accountName: 'Cents', accountNumber: crypto.randomUUID(), bankName: 'Test Bank', accountType: 'checking', currency: 'NZD', openingBalance: '0.10' }, 201);
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0.10', statementClosingBalance: '0.14' }, 201);
      for (const [adjustmentType, amount, affectsBank, affectsBook] of [['deposit_in_transit', '0.01', true, false], ['outstanding_check', '0.02', true, false], ['book_error', '-0.03', false, true]] as const) await f.request(`/api/reconciliation-sessions/${session.id}/adjustments`, 'POST', { adjustmentType, amount, affectsBank, affectsBook, description: 'Reviewed statement adjustment' }, 201);
      expect(await f.request(`/api/reconciliation-sessions/${session.id}/summary`, 'GET')).toMatchObject({ bankBalance: '0.14', bookBalance: '0.10', totalOutstandingDeposits: '0.01', totalOutstandingChecks: '0.02', totalOtherAdjustments: '0.03', adjustedBankBalance: '0.13', adjustedBookBalance: '0.13', finalDifference: '0.00', isReconciled: true });
      expect(await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {})).toMatchObject({ bookClosingBalance: '0.13', difference: '0.00' });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('rejects invalid or reversed periods and statement balances beyond cent precision', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const request = { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '0' };
      await f.request('/api/reconciliation-sessions', 'POST', { ...request, statementStartDate: '2026-02-30' }, 400);
      await f.request('/api/reconciliation-sessions', 'POST', { ...request, statementStartDate: '2026-11-01' }, 400);
      await f.request('/api/reconciliation-sessions', 'POST', { ...request, statementClosingBalance: '-69.001' }, 400);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));
});
