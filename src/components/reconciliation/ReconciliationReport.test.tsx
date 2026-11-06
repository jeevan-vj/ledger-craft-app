import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ReconciliationReport } from './ReconciliationReport';
import type { ReconciliationSummary } from '@/types/reconciliation';

const summary = {
  session: { statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', status: 'in_progress', matchedCount: 0, unmatchedBankCount: 0, unmatchedBookCount: 0 },
  bankAccountName: 'Operating', bankName: 'Test', bankBalance: 0.14, adjustedBankBalance: 0.10,
  bookBalance: 0.10, adjustedBookBalance: 0.10, outstandingDeposits: [], outstandingChecks: [],
  otherAdjustments: [
    { id: 'bank-error', description: 'Reviewed bank mistake', amount: -0.04, affectsBank: true, affectsBook: false, adjustmentType: 'bank_error', status: 'pending' },
    { id: 'legacy-fee', description: 'Old unposted fee', amount: 10, affectsBank: false, affectsBook: true, adjustmentType: 'bank_fee', status: 'pending' },
  ], totalOutstandingDeposits: 0, totalOutstandingChecks: 0, totalOtherAdjustments: -0.04,
  finalDifference: 0, isReconciled: true, warnings: ['Old unposted fee is excluded: record the actual expense or journal first.'],
} as unknown as ReconciliationSummary;
it('shows bank errors on the bank side and explains excluded unposted legacy corrections', () => {
  render(<ReconciliationReport summary={summary} />);
  const bank = screen.getByText('Bank Balance Reconciliation').parentElement!.parentElement!;
  const book = screen.getByText('Book Balance Reconciliation').parentElement!.parentElement!;
  expect(within(bank).getByText('Reviewed bank mistake')).toBeInTheDocument();
  expect(within(book).queryByText('Reviewed bank mistake')).not.toBeInTheDocument();
  expect(within(book).queryByText('Old unposted fee')).not.toBeInTheDocument();
  expect(screen.getByText(summary.warnings![0])).toBeInTheDocument();
});
