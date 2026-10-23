import { apiRequest } from '@/features/auth/api/http';

export type ReportBasis = 'accrual' | 'cash';
export interface ReportQuery { from: string; to: string; basis: ReportBasis; baseCurrency: 'NZD' }
export interface ReportAccountRow { accountId: string; accountNumber: string | null; accountName: string; accountClass: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'; debit: string; credit: string; balance: string }
export interface AgingItem { id: string; number: string; partyId: string; partyName: string; issueDate: string; dueDate: string; balanceDue: string; daysOverdue: number; bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+' }
export interface AgingReport { total: string; current: string; days1To30: string; days31To60: string; days61To90: string; over90: string; items: AgingItem[] }
export interface FinancialReport {
  meta: ReportQuery & { generatedAt: string };
  trialBalance: { rows: (ReportAccountRow & { openingDebit: string; openingCredit: string; closingDebit: string; closingCredit: string })[]; totalDebits: string; totalCredits: string; balanced: boolean };
  profitLoss: { rows: ReportAccountRow[]; revenue: string; expenses: string; netIncome: string };
  balanceSheet: { rows: ReportAccountRow[]; assets: string; liabilities: string; equity: string; balanced: boolean };
  cashFlow: { rows: ReportAccountRow[]; openingCash: string; inflows: string; outflows: string; netCashFlow: string; closingCash: string };
  receivablesAging: AgingReport; payablesAging: AgingReport;
  taxSummary: { collected: string; paid: string; netPayable: string };
}

export const reportsApi = {
  financial(query: ReportQuery): Promise<FinancialReport> {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      basis: query.basis,
      baseCurrency: query.baseCurrency,
    });
    return apiRequest(`/api/reports/financial?${params}`, { method: 'GET' });
  },
};
