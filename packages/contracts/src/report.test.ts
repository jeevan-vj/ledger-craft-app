import { describe, expect, it } from 'vitest';
import { financialReportQuerySchema, financialReportResponseSchema } from './report';

describe('report contracts', () => {
  it('validates exact report filters and comparison periods', () => {
    expect(financialReportQuerySchema.safeParse({
      from: '2026-01-01',
      to: '2026-12-31',
      basis: 'accrual',
      baseCurrency: 'NZD',
      comparisonFrom: '2025-01-01',
      comparisonTo: '2025-12-31',
      accountIds: ['11111111-1111-1111-1111-111111111111'],
    }).success).toBe(true);
    expect(financialReportQuerySchema.safeParse({
      from: '2026-12-31',
      to: '2026-01-01',
      basis: 'cash',
      baseCurrency: 'NZD',
    }).success).toBe(false);
    expect(financialReportQuerySchema.safeParse({
      from: '2026-01-01',
      to: '2026-12-31',
      basis: 'cash',
      baseCurrency: 'USD',
    }).success).toBe(false);
  });

  it('keeps all authoritative money as decimal text', () => {
    const result = financialReportResponseSchema.safeParse({
      meta: { from: '2026-01-01', to: '2026-12-31', basis: 'accrual', baseCurrency: 'NZD', generatedAt: new Date().toISOString() },
      trialBalance: { rows: [], totalDebits: '100.00', totalCredits: '100.00', balanced: true },
      profitLoss: { revenue: '80.00', expenses: '20.00', netIncome: '60.00', rows: [] },
      balanceSheet: { assets: '160.00', liabilities: '100.00', equity: '60.00', balanced: true, rows: [] },
      cashFlow: { openingCash: '0.00', inflows: '100.00', outflows: '40.00', netCashFlow: '60.00', closingCash: '60.00', rows: [] },
      receivablesAging: { total: '0.00', current: '0.00', days1To30: '0.00', days31To60: '0.00', days61To90: '0.00', over90: '0.00', items: [] },
      payablesAging: { total: '0.00', current: '0.00', days1To30: '0.00', days31To60: '0.00', days61To90: '0.00', over90: '0.00', items: [] },
      salesSummary: { subtotal: '80.00', tax: '12.00', total: '92.00', paid: '92.00', outstanding: '0.00' },
      purchaseSummary: { subtotal: '20.00', tax: '3.00', total: '23.00', paid: '23.00', outstanding: '0.00' },
      taxSummary: { collected: '12.00', paid: '3.00', netPayable: '9.00' },
      comparison: null,
    });
    expect(result.success).toBe(true);
    expect(financialReportResponseSchema.safeParse({ ...result.data!, profitLoss: { ...result.data!.profitLoss, revenue: 80 } }).success).toBe(false);
  });
});
