import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountingService } from '../accountingService';
import { reportsApi } from '@/features/reports/api/reportsApi';
import type { FinancialReportResponse } from '@ledgercraft/contracts';
vi.mock('@/features/reports/api/reportsApi', () => ({ reportsApi: { financial: vi.fn() } }));
vi.mock('@/features/ledger/api/ledgerSnapshot', () => ({ ledgerSnapshotEnabled: () => true, loadLedgerSnapshot: vi.fn(async () => ({ invoices: [], expenses: [], payments: [], accounts: [] })) }));
const aging = (amount: string) => ({ total: amount, current: amount, days1To30: '0', days31To60: '0', days61To90: '0', over90: '0', items: [] });
const document = { subtotal: '0', tax: '0', total: '0', paid: '0', outstanding: '0' };
export const postedReport: FinancialReportResponse = {
  meta: { from: '2026-04-01', to: '2026-04-30', basis: 'accrual', baseCurrency: 'NZD', generatedAt: '2026-05-01T00:00:00Z' },
  profitLoss: { revenue: '1400.00', expenses: '550.00', netIncome: '850.00', rows: [{ accountId: 'expenses', accountNumber: '5000', accountName: 'Operating Expenses', accountClass: 'expense', debit: '550', credit: '0', balance: '550' }] },
  cashFlow: { openingCash: '0', inflows: '6380', outflows: '349', netCashFlow: '6031', closingCash: '6031.00', rows: [] },
  balanceSheet: { assets: '6336', liabilities: '486', equity: '5850', balanced: true, rows: [] },
  trialBalance: { totalDebits: '6336', totalCredits: '6336', balanced: true, rows: [{ accountId: 'cash', accountName: 'Bank Current', accountNumber: '1110', accountClass: 'asset', debit: '6380', credit: '349', balance: '6031.00', openingDebit: '0', openingCredit: '0', closingDebit: '6031', closingCredit: '0' }] },
  receivablesAging: aging('230.00'), payablesAging: aging('276.00'), salesSummary: document, purchaseSummary: document,
  taxSummary: { collected: '210', paid: '75', netPayable: '135', outputGst: '210', inputGst: '75', netGst: '135', position: 'payable', gstAccounts: [], keyAccounts: [], basis: 'invoice', foreignCurrencyDocumentsExcluded: 0, warnings: [] }, comparison: null,
};
beforeEach(() => { vi.clearAllMocks(); vi.mocked(reportsApi.financial).mockResolvedValue(postedReport); });
describe('accounting dashboard posted ledger source', () => {
  it('uses net posted profit, actual cash and GST rather than source-document estimates', async () => {
    expect(await new AccountingService().getFinancialSummary({ startDate: '2026-04-01', endDate: '2026-04-30' })).toMatchObject({
      totalRevenue: 1400, totalExpenses: 550, netIncome: 850, totalReceivables: 230, totalPayables: 276, cashPosition: 6031, gstLiability: 135,
      gstCollected: 210, gstPaid: 75, receivablesAging: { current: '230.00' }, payablesAging: { current: '276.00' },
    });
    expect(reportsApi.financial).toHaveBeenCalledWith({ from: '2026-04-01', to: '2026-04-30', basis: 'accrual', baseCurrency: 'NZD' });
  });
  it('uses trial-balance bank balances instead of fabricated default accounts', async () => {
    expect(await new AccountingService().getAccountBalances()).toEqual([{ accountId: 'cash', accountName: 'Bank Current', accountNumber: '1110', accountClass: 'asset', openingBalance: 0, totalDebits: 6380, totalCredits: 349, closingBalance: 6031 }]);
  });
  it('surfaces report failures rather than returning a zero or invented financial position', async () => {
    vi.mocked(reportsApi.financial).mockRejectedValue(new Error('Ledger unavailable'));
    await expect(new AccountingService().getFinancialSummary()).rejects.toThrow('Ledger unavailable');
    await expect(new AccountingService().getAccountBalances()).rejects.toThrow('Ledger unavailable');
  });
  it('anchors account balances and chart periods to the requested accounting date', async () => {
    const service = new AccountingService();
    await service.getAccountBalances({ startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(reportsApi.financial).toHaveBeenLastCalledWith({ from: '2026-04-01', to: '2026-04-30', basis: 'accrual', baseCurrency: 'NZD' });
    await service.getRevenueExpenseData(1, new Date('2026-04-30T12:00:00Z'));
    expect(reportsApi.financial).toHaveBeenLastCalledWith({ from: '2026-04-01', to: '2026-04-30', basis: 'accrual', baseCurrency: 'NZD' });
    await service.getCashFlowData(1, new Date('2026-04-30T12:00:00Z'));
    expect(reportsApi.financial).toHaveBeenLastCalledWith({ from: '2026-04-30', to: '2026-04-30', basis: 'accrual', baseCurrency: 'NZD' });
  });

  it('preserves credit direction for account balances instead of labelling revenue as debit', async () => {
    vi.mocked(reportsApi.financial).mockResolvedValue({ ...postedReport, trialBalance: { ...postedReport.trialBalance,
      rows: postedReport.trialBalance.rows.map((row) => ({ ...row, accountClass: 'revenue', debit: '0', credit: '1400', balance: '1400', closingDebit: '0', closingCredit: '1400' })),
    } });
    expect((await new AccountingService().getAccountBalances())[0].closingBalance).toBe(-1400);
  });

});
