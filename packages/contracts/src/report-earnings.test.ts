import { describe, expect, it } from 'vitest';
import { financialReportResponseSchema, type FinancialReportResponse } from './report';
import { financialReportCsv, financialReportRows } from './report-export';

const statement = { assets: '12915.00', liabilities: '915.00', equity: '12000.00', balanced: true, rows: [] };
describe('canonical accumulated-earnings disclosure', () => {
  it('retains optional exact server earnings, including loss, while accepting older reports', () => {
    const schema = financialReportResponseSchema.shape.balanceSheet;
    expect(schema.parse({ ...statement, accumulatedEarnings: '2000.00' })).toMatchObject({ accumulatedEarnings: '2000.00', equity: '12000.00' });
    expect(schema.parse({ ...statement, accumulatedEarnings: '-0.01' })).toMatchObject({ accumulatedEarnings: '-0.01' });
    expect(schema.safeParse({ ...statement, accumulatedEarnings: 2000 }).success).toBe(false);
    expect(schema.safeParse(statement).success).toBe(true);
  });
  it('copies the canonical earnings bridge into the shared CSV and PDF rows without calculating it', () => {
    const report = { meta: { from: '2027-04-01', to: '2027-04-30', basis: 'accrual' }, balanceSheet: { ...statement, accumulatedEarnings: '9007199254740993.01' } } as unknown as FinancialReportResponse;
    const label = 'Accumulated earnings (included in equity)';
    expect(financialReportRows(report, 'balance-sheet')).toContainEqual([label, '', '', '', '9007199254740993.01']);
    expect(financialReportCsv(report, 'balance-sheet')).toContain(`"${label}","","","","9007199254740993.01"`);
    expect(financialReportRows(report, 'balance-sheet')).toContainEqual(['Equity (includes retained income)', '', '', '', '12000.00']);
    const legacy = { ...report, balanceSheet: { ...statement } };
    expect(financialReportRows(legacy, 'balance-sheet').some(row => row[0] === label)).toBe(false);
  });
});
