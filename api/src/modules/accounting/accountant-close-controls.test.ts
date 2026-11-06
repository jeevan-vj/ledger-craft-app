import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import type { ReconciliationSummaryDto } from '@ledgercraft/contracts';
import { eq } from 'drizzle-orm';
import { bankAccounts } from '../../db/schema/bank';
import { reconciliationAdjustments } from '../../db/schema/reconciliation';

// Independent close-control checks: timing differences reconcile the statement;
// a book expense must first exist as a balanced posted journal.
describe('accountant month-close controls', () => {
  it('does not accept a metadata-only bank fee as a posted book correction', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '-10' }, 201);
      // A reviewed fee still needs the actual expense/cash journal. The general
      // declaration endpoint cannot manufacture that ledger movement.
      await f.request(`/api/reconciliation-sessions/${session.id}/adjustments`, 'POST', { adjustmentType: 'bank_fee', amount: '10', affectsBank: false, affectsBook: true, description: 'October bank fee not yet recorded' }, 422);
      const summary = await f.request<ReconciliationSummaryDto>(`/api/reconciliation-sessions/${session.id}/summary`, 'GET');
      expect(summary).toMatchObject({ bookBalance: '0.00', adjustedBookBalance: '0.00', finalDifference: '-10.00', isReconciled: false });
      await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {}, 400);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('rejects new adjustments after the statement is completed', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '0' }, 201);
      await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {});
      await f.request(`/api/reconciliation-sessions/${session.id}/adjustments`, 'POST', { adjustmentType: 'deposit_in_transit', amount: '25', affectsBank: true, affectsBook: false, description: 'Late alteration to completed statement' }, 409);
      const summary = await f.request<ReconciliationSummaryDto>(`/api/reconciliation-sessions/${session.id}/summary`, 'GET');
      expect(summary).toMatchObject({ adjustedBankBalance: '0.00', adjustedBookBalance: '0.00', finalDifference: '0.00', isReconciled: true });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('rejects posting a backdated manual bank journal after statement completion', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request('/api/bank-transactions', 'POST', { bankAccountId: f.bank.id, transactionDate: '2026-10-01', amount: '1', type: 'credit', description: 'Posted opening cash' }, 201);
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '1' }, 201);
      await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {});
      const chart = await f.request<{ accounts: Array<{ id: string; accountNumber: string | null }> }>('/api/accounts', 'GET');
      const bankAccount = chart.accounts.find(account => account.accountNumber === `BANK-${String(f.bank.id).slice(0, 8).toUpperCase()}`);
      expect(bankAccount).toBeDefined();
      const draft = await f.request('/api/journal-entries', 'POST', { entryDate: '2026-09-20', description: 'Backdated manual correction', debitAccountId: bankAccount!.id, creditAccountId: f.cost.id, amount: '2' }, 201);
      await f.request(`/api/journal-entries/${draft.id}`, 'PATCH', { status: 'posted' }, 409);
      expect(await f.request(`/api/reconciliation-sessions/${session.id}/summary`, 'GET')).toMatchObject({ bookBalance: '1.00', finalDifference: '0.00', isReconciled: true });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('protects the opening-balance fallback after a completed statement', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '0' }, 201);
      await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {});
      const updates = [];
      for (const body of [{ openingBalance: '100' }, { currency: 'USD' }]) {
        const response = await f.app.request(`/api/bank-accounts/${f.bank.id}`, { method: 'PATCH', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json', Cookie: f.cookie }, body: JSON.stringify(body) });
        updates.push(response.status);
      }
      expect(updates).toEqual([409, 409]);
      expect(await f.request(`/api/reconciliation-sessions/${session.id}/summary`, 'GET')).toMatchObject({ bookBalance: '0.00', finalDifference: '0.00', isReconciled: true });
      // Non-financial corrections remain possible.
      await f.request(`/api/bank-accounts/${f.bank.id}`, 'PATCH', { accountName: 'Corrected display name' });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('does not delete a bank and cascade away its completed statement audit', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '0' }, 201);
      await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {});
      await f.request(`/api/bank-accounts/${f.bank.id}`, 'DELETE', undefined, 409);
      expect(await f.request(`/api/reconciliation-sessions/${session.id}`, 'GET')).toMatchObject({ status: 'completed', bookClosingBalance: '0.00' });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it.each([
    { adjustmentType: 'deposit_in_transit', amount: '10', affectsBank: false, affectsBook: true },
    { adjustmentType: 'outstanding_check', amount: '-10', affectsBank: true, affectsBook: false },
  ])('excludes malformed historical $adjustmentType instead of manufacturing readiness', async (adjustment) => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '-10' }, 201);
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      await f.db.insert(reconciliationAdjustments).values({ organisationId: bank.organisationId, userId: bank.userId, reconciliationId: String(session.id), description: 'Unreviewed legacy declaration', ...adjustment });
      const summary = await f.request<ReconciliationSummaryDto>(`/api/reconciliation-sessions/${session.id}/summary`, 'GET');
      expect(summary).toMatchObject({ adjustedBankBalance: '-10.00', adjustedBookBalance: '0.00', finalDifference: '-10.00', isReconciled: false });
      expect(summary.warnings?.length).toBeGreaterThan(0);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('protects the chart identity and classification of a completed bank ledger', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request('/api/bank-transactions', 'POST', { bankAccountId: f.bank.id, transactionDate: '2026-10-01', amount: '1', type: 'credit', description: 'Posted opening cash' }, 201);
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '1' }, 201);
      await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {});
      const chart = await f.request<{ accounts: Array<{ id: string; accountNumber: string | null }> }>('/api/accounts', 'GET');
      const bankAccount = chart.accounts.find(account => account.accountNumber === `BANK-${String(f.bank.id).slice(0, 8).toUpperCase()}`);
      expect(bankAccount).toBeDefined();
      const statuses = [];
      for (const body of [{ accountNumber: 'MOVED-BANK' }, { type: 'expense' }, { accountClass: 'expense' }, { currency: 'USD' }]) {
        const response = await f.app.request(`/api/accounts/${bankAccount!.id}`, { method: 'PATCH', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json', Cookie: f.cookie }, body: JSON.stringify(body) });
        statuses.push(response.status);
      }
      expect(statuses).toEqual([409, 409, 409, 409]);
      expect(await f.request(`/api/reconciliation-sessions/${session.id}/summary`, 'GET')).toMatchObject({ bookBalance: '1.00', finalDifference: '0.00', isReconciled: true });
      await f.request(`/api/accounts/${bankAccount!.id}`, 'PATCH', { name: 'Corrected ledger display name' });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('rejects non-canonical manual dates instead of bypassing the cutoff lexical comparison', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request('/api/bank-transactions', 'POST', { bankAccountId: f.bank.id, transactionDate: '2026-10-01', amount: '1', type: 'credit', description: 'Posted opening cash' }, 201);
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '1' }, 201);
      await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {});
      const chart = await f.request<{ accounts: Array<{ id: string; accountNumber: string | null }> }>('/api/accounts', 'GET');
      const bankAccount = chart.accounts.find(account => account.accountNumber === `BANK-${String(f.bank.id).slice(0, 8).toUpperCase()}`);
      expect(bankAccount).toBeDefined();
      const draft = await f.request('/api/journal-entries', 'POST', { entryDate: '2026-9-20', description: 'Non-canonical historical cash correction', debitAccountId: bankAccount!.id, creditAccountId: f.cost.id, amount: '2' }, 201);
      await f.request(`/api/journal-entries/${draft.id}`, 'PATCH', { status: 'posted' }, 422);
      expect(await f.request(`/api/reconciliation-sessions/${session.id}/summary`, 'GET')).toMatchObject({ bookBalance: '1.00', finalDifference: '0.00', isReconciled: true });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('rejects backdated cash posting through a completed bank statement cutoff', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const session = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '0' }, 201);
      await f.request(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {});
      await f.request('/api/bank-transactions', 'POST', { bankAccountId: f.bank.id, transactionDate: '2026-10-20', amount: '100', type: 'credit', description: 'Backdated receipt after completion' }, 409);
      const summary = await f.request<ReconciliationSummaryDto>(`/api/reconciliation-sessions/${session.id}/summary`, 'GET');
      expect(summary).toMatchObject({ bookBalance: '0.00', finalDifference: '0.00', isReconciled: true });
      // Posting to the next period remains legitimate.
      await f.request('/api/bank-transactions', 'POST', { bankAccountId: f.bank.id, transactionDate: '2026-11-01', amount: '100', type: 'credit', description: 'Next-period receipt' }, 201);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));
});
