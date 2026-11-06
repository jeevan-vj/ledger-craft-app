import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ImportSummary } from './ImportSummary';
import type { BankAccount, TransactionImportResult } from '@/types/bankTransaction';
const bank: BankAccount = { id: 'bank', accountName: 'Operating', accountNumber: '1', bankName: 'Bank', accountType: 'checking', currency: 'NZD', openingBalance: 0, currentBalance: 0, isActive: true };
it('shows actual import counts and imported transaction amounts using the current result contract', () => {
 const result: TransactionImportResult = { success: true, importedCount: 2, duplicatesSkipped: 1, errors: ['Invalid date row 4'], transactions: [
  { id: 'credit', bankAccountId: 'bank', transactionDate: '2026-04-01', description: 'Receipt', amount: 100, type: 'credit', isReconciled: false },
  { id: 'debit', bankAccountId: 'bank', transactionDate: '2026-04-01', description: 'Expense', amount: 20, type: 'debit', isReconciled: false },
 ] };
 render(<ImportSummary importResult={result} bankAccount={bank} onStartOver={vi.fn()} onViewTransactions={vi.fn()} />);
 expect(screen.getByText(/2 transactions have been imported into/)).toBeInTheDocument();
 expect(screen.getByText('50%')).toBeInTheDocument();
 expect(screen.getByText('Total Credits').parentElement?.parentElement).toHaveTextContent('$100.00');
 expect(screen.getByText('Total Debits').parentElement?.parentElement).toHaveTextContent('$20.00');
 expect(screen.getByText('Net Amount').parentElement?.parentElement).toHaveTextContent('$80.00');
 expect(screen.getByText(/1 duplicate transactions/)).toBeInTheDocument();
 expect(screen.getByText(/1 transactions failed to import/)).toBeInTheDocument();
});
