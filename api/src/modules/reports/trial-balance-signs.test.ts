import { expect, it } from 'vitest';
import { buildFinancialReport } from './reports.engine';
import type { LedgerRow } from './reports.repository';

const bankId = '10000000-0000-4000-8000-000000000001';
const payableId = '10000000-0000-4000-8000-000000000002';
const row = (bank: boolean, amount: string): LedgerRow => ({
  journalEntryId: 'entry', entryNumber: 'JE-1', date: '2026-04-10', description: 'Contra balance',
  referenceType: 'manual', referenceId: 'source', accountId: bank ? bankId : payableId,
  accountNumber: bank ? '1110' : '2100', accountName: bank ? 'Overdrawn bank' : 'Debit payable',
  accountType: bank ? 'bank' : 'liability', accountClass: bank ? 'asset' : 'liability',
  normalBalance: bank ? 'debit' : 'credit', currency: 'NZD',
  debit: bank ? '0.00' : amount, credit: bank ? amount : '0.00',
});

it('puts negative-normal opening and closing balances on the opposite debit/credit side', () => {
  const report = buildFinancialReport({
    query: { from: '2026-05-01', to: '2026-05-31', basis: 'accrual', baseCurrency: 'NZD' },
    openingRows: [row(true, '100.00'), row(false, '100.00')],
    periodRows: [row(true, '50.00'), row(false, '50.00')], receivables: [], payables: [],
  });
  expect(report.trialBalance.rows.find(account => account.accountId === bankId)).toMatchObject({
    openingDebit: '0.00', openingCredit: '100.00', balance: '-150.00', closingDebit: '0.00', closingCredit: '150.00',
  });
  expect(report.trialBalance.rows.find(account => account.accountId === payableId)).toMatchObject({
    openingDebit: '100.00', openingCredit: '0.00', balance: '-150.00', closingDebit: '150.00', closingCredit: '0.00',
  });
  expect(report.trialBalance.balanced).toBe(true);
});

it('reports unallocated opening receivables without inventing a customer or presenting zero debt', () => {
  const report = buildFinancialReport({
    query: { from: '2026-04-01', to: '2026-04-30', basis: 'accrual', baseCurrency: 'NZD' },
    openingRows: [], receivables: [], payables: [],
    periodRows: [
      { ...row(true, '0'), accountNumber: '1200', accountName: 'Accounts Receivable', accountType: 'asset', debit: '5000.00' },
      { ...row(false, '0'), accountNumber: '3000', accountName: 'Opening capital', accountClass: 'equity', accountType: 'equity', credit: '5000.00' },
    ],
  });
  expect(report.receivablesAging).toMatchObject({ total: '5000.00', unallocatedControl: '5000.00', current: '0.00', items: [] });
});
