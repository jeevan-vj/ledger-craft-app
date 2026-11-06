import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import { bankAccounts } from '../../db/schema/bank';
import { reconciliationAdjustments } from '../../db/schema/reconciliation';

describe('statement adjustments never manufacture book entries', () => {
  it('applies signed bank errors to the statement side only', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const s = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '3' }, 201);
      await f.request(`/api/reconciliation-sessions/${s.id}/adjustments`, 'POST', { adjustmentType: 'bank_error', amount: '-3', affectsBank: true, affectsBook: false, description: 'Bank confirmed duplicate credit' }, 201);
      expect(await f.request(`/api/reconciliation-sessions/${s.id}/summary`, 'GET')).toMatchObject({ adjustedBankBalance: '0.00', adjustedBookBalance: '0.00', finalDifference: '0.00', isReconciled: true });
    } finally { await f.sql.end(); }
  }));
  it('excludes historical unposted book fees and reversed timing items, disclosing the fee', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const s = await f.request('/api/reconciliation-sessions', 'POST', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '-10' }, 201);
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      // Historical rows predate the new write guard; preserve them for review.
      await f.db.insert(reconciliationAdjustments).values([
        { organisationId: bank.organisationId, userId: bank.userId, reconciliationId: String(s.id), adjustmentType: 'bank_fee', amount: '10', affectsBank: false, affectsBook: true, description: 'Legacy unposted fee' },
        { organisationId: bank.organisationId, userId: bank.userId, reconciliationId: String(s.id), adjustmentType: 'deposit_in_transit', amount: '100', affectsBank: true, affectsBook: false, description: 'Reversed timing item', status: 'reversed' },
        { organisationId: bank.organisationId, userId: bank.userId, reconciliationId: String(s.id), adjustmentType: 'deposit_in_transit', amount: '7', affectsBank: false, affectsBook: true, description: 'Legacy invalid timing flags' },
      ]);
      const summary = await f.request(`/api/reconciliation-sessions/${s.id}/summary`, 'GET');
      expect(summary).toMatchObject({ adjustedBankBalance: '-10.00', adjustedBookBalance: '0.00', finalDifference: '-10.00', isReconciled: false, totalOutstandingDeposits: '0.00', totalOtherAdjustments: '0.00' });
      expect(summary.warnings).toEqual([expect.stringMatching(/unposted.*book|book.*not.*posted/i)]);
    } finally { await f.sql.end(); }
  }));
});
