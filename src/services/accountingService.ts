import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns';
import { reportsApi } from '@/features/reports/api/reportsApi';
import type { AccountBalanceSummary, FinancialSummary } from '@/types/payment';
import { decimal } from '../../api/src/modules/invoices/money';

export interface FinancialPeriod { startDate: string; endDate: string }
export interface CashFlowData { day: string; inflow: number; outflow: number }
export interface RevenueExpenseData { month: string; revenue: number; expenses: number }
const date = (value: Date) => format(value, 'yyyy-MM-dd');
const defaultPeriod = (): FinancialPeriod => ({ startDate: date(startOfMonth(new Date())), endDate: date(endOfMonth(new Date())) });
const reportFor = (period: FinancialPeriod) => reportsApi.financial({ from: period.startDate, to: period.endDate, basis: 'accrual', baseCurrency: 'NZD' });

/** Presentation adapter: every monetary figure comes from posted ledger reports.
 * Number conversion is for the existing charts only; no document-derived totals
 * or fabricated fallbacks are calculated here. Failed reports remain failures. */
export class AccountingService {
  async getFinancialSummary(period = defaultPeriod()): Promise<FinancialSummary> {
    const report = await reportFor(period);
    return {
      totalAssets: Number(report.balanceSheet.assets), totalLiabilities: Number(report.balanceSheet.liabilities), totalEquity: Number(report.balanceSheet.equity),
      totalRevenue: Number(report.profitLoss.revenue), totalExpenses: Number(report.profitLoss.expenses),
      netIncome: Number(report.profitLoss.netIncome), totalReceivables: Number(report.receivablesAging.total),
      totalPayables: Number(report.payablesAging.total), cashPosition: Number(report.cashFlow.closingCash),
      gstLiability: Number(report.taxSummary.netGst), gstCollected: Number(report.taxSummary.outputGst), gstPaid: Number(report.taxSummary.inputGst),
      outstandingInvoices: report.receivablesAging.items.length, outstandingBills: report.payablesAging.items.length,
      receivablesAging: report.receivablesAging, payablesAging: report.payablesAging, period,
    };
  }

  async getAccountBalances(period = defaultPeriod()): Promise<AccountBalanceSummary[]> {
    const report = await reportFor(period);
    return report.trialBalance.rows.map((row) => ({
      accountId: row.accountId, accountName: row.accountName, accountNumber: row.accountNumber ?? '', accountClass: row.accountClass,
      openingBalance: Number(decimal(row.openingDebit).sub(row.openingCredit).toFixed()),
      totalDebits: Number(row.debit), totalCredits: Number(row.credit), closingBalance: Number(decimal(row.closingDebit).sub(row.closingCredit).toFixed()),
    }));
  }

  async getRevenueExpenseData(months = 6, through = new Date()): Promise<RevenueExpenseData[]> {
    return Promise.all(Array.from({ length: Math.max(0, Math.min(24, months)) }, async (_, index) => {
      const month = subMonths(through, months - index - 1);
      const report = await reportFor({ startDate: date(startOfMonth(month)), endDate: date(endOfMonth(month)) });
      return { month: format(month, 'MMM'), revenue: Number(report.profitLoss.revenue), expenses: Number(report.profitLoss.expenses) };
    }));
  }

  async getCashFlowData(days = 30, through = new Date()): Promise<CashFlowData[]> {
    return Promise.all(Array.from({ length: Math.max(0, Math.min(31, days)) }, async (_, index) => {
      const day = subDays(through, days - index - 1);
      const report = await reportFor({ startDate: date(day), endDate: date(day) });
      return { day: format(day, 'dd MMM'), inflow: Number(report.cashFlow.inflows), outflow: Number(report.cashFlow.outflows) };
    }));
  }

  async getExpenseBreakdown(period = defaultPeriod()) {
    const report = await reportFor(period);
    const total = Number(report.profitLoss.expenses);
    return report.profitLoss.rows.filter((row) => row.accountClass === 'expense')
      .map((row) => ({ category: row.accountName, amount: Number(row.balance), percentage: total > 0 ? Number(row.balance) / total * 100 : 0 }))
      .sort((left, right) => right.amount - left.amount);
  }
}
export const accountingService = new AccountingService();
