import { expect, it } from 'vitest';
import { buildFinancialReport } from './reports.engine';
import type { LedgerRow } from './reports.repository';
const row = (id: string, date: string, type: string, referenceId: string, debit: string, credit: string): LedgerRow => ({ journalEntryId: id, entryNumber: id, date, description: id, referenceType: type, referenceId, accountId: '10000000-0000-4000-8000-000000000001', accountNumber: '1110', accountName: 'Bank', accountType: 'bank', accountClass: 'asset', normalBalance: 'debit', currency: 'NZD', debit, credit });
const query = { from: '2026-10-01', to: '2026-10-31', basis: 'accrual' as const, baseCurrency: 'NZD' as const, columns: 'month' as const };
it('nets only statement import/reconciliation technical cash legs, retaining original receipts and gross refunds', () => {
  const periodRows = [row('receipt','2026-10-05','payment','p','1150','0'),row('refund','2026-10-12','credit_note_refund','r','0','115'),row('import','2026-10-05','bank_transaction','t','1150','0'),row('match','2026-10-05','bank_reconciliation_accept','a','0','1150')];
  const result = buildFinancialReport({ query, periodRows, openingRows: [], receivables: [], payables: [], cashFlowGroups: { a: 't', match: 't' } });
  expect(result.cashFlow).toMatchObject({ inflows: '1150.00', outflows: '115.00', netCashFlow: '1035.00' });
  expect(result.columns?.periods[0].cashFlow).toEqual(result.cashFlow);
  expect(result.trialBalance.rows[0]).toMatchObject({ debit: '2300.00', credit: '1265.00', closingDebit: '1035.00' });
});
it('keeps unmatched imports and nets a later undo/rematch by statement identity, without erasing cutoff movements', () => {
  const periodRows = [row('import','2026-10-05','bank_transaction','t','100','0'),row('match','2026-10-05','bank_reconciliation_accept','a','0','100'),row('undo','2026-10-06','bank_reconciliation_undo','match','100','0'),row('rematch','2026-11-05','bank_reconciliation_accept','b','0','100')];
  const result = buildFinancialReport({ query, periodRows: periodRows.filter(r=>r.date<=query.to), openingRows: [], receivables: [], payables: [], cashFlowGroups: { a:'t',match:'t',b:'t',rematch:'t' } });
  expect(result.cashFlow).toMatchObject({ inflows:'100.00',outflows:'0.00',closingCash:'100.00' });
});
