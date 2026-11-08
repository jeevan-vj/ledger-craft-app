import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabaseUrl } from '../../env';
import type { FinancialReportResponse, GstPreparationResponse } from '@ledgercraft/contracts';
import { withTestDb } from '../../test/harness';
import { secondMonthFixture, periodPath, reportSections } from './second-month.test-helper';

const historicalEvidencePath = new URL('../../../../docs/evidence/second-month-year-end/api/results.json', import.meta.url);
let historicalEvidenceBefore: string;
beforeAll(async () => { historicalEvidenceBefore = await readFile(historicalEvidencePath, 'utf8'); });

type PaperTrial = { rows: Array<{ accountRole: string; debit: string; credit: string }>; totalDebits: string; totalCredits: string };
type PaperPeriod = { closingTrialBalance: PaperTrial; profitLoss: { accrual: { revenue: string; expenses: string; netIncome: string }; cash?: { revenue: string; expenses: string; netIncome: string } }; balanceSheet: { assets: string; liabilities: string; equity: string; balanced: boolean }; cashFlow?: { openingCash: string; inflows: string; outflows: string; netCashFlow: string; closingCash: string }; receivablesAging: Record<string, string>; payablesAging: Record<string, string> };
function assertPeriod(report: FinancialReportResponse, expected: PaperPeriod, roleCodes: Record<string, string>) {
  expect(report.profitLoss).toMatchObject(expected.profitLoss.accrual);
  expect(report.balanceSheet).toMatchObject(Object.fromEntries(['assets', 'liabilities', 'equity', 'balanced'].map(key => [key, expected.balanceSheet[key as keyof typeof expected.balanceSheet]])));
  expect(report.trialBalance).toMatchObject({ closingDebits: expected.closingTrialBalance.totalDebits, closingCredits: expected.closingTrialBalance.totalCredits, balanced: true });
  for (const row of expected.closingTrialBalance.rows) expect(report.trialBalance.rows.find(item => item.accountNumber === roleCodes[row.accountRole]), row.accountRole).toMatchObject({ closingDebit: row.debit, closingCredit: row.credit });
  if (expected.cashFlow) expect(report.cashFlow).toMatchObject(Object.fromEntries(['openingCash', 'inflows', 'outflows', 'netCashFlow', 'closingCash'].map(key => [key, expected.cashFlow![key as keyof typeof expected.cashFlow]])));
  for (const name of ['receivablesAging', 'payablesAging'] as const) expect(report[name]).toMatchObject(expected[name]);
}
function assertOpening(report: FinancialReportResponse, trial: PaperTrial, roleCodes: Record<string, string>) {
  for (const row of trial.rows) expect(report.trialBalance.rows.find(item => item.accountNumber === roleCodes[row.accountRole]), `${row.accountRole} opening`).toMatchObject({ openingDebit: row.debit, openingCredit: row.credit });
}

describe('second month and NZ financial-year rollover through real HTTP/SQLite', () => {
  it('carries October into November and April without rewriting closed statements, old aging or prior-year earnings', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-05-01T00:00:00Z') });
    try { await withTestDb(async () => {
      const paper = JSON.parse(await readFile(new URL('../../../../docs/evidence/second-month-year-end/expected.json', import.meta.url), 'utf8'));
      const f = await secondMonthFixture();
      try {
        const roles = { bank: f.bankNumber, capital: '3000', receivables: '1200', sales: '4000', outputGst: '2200', inputGst: '2150', operatingCosts: '5000', payables: '2100', customerCredit: '2300' };
        const november = await f.request<FinancialReportResponse>(periodPath('2026-11-01', '2026-11-30'));
        expect(november.balanceSheet).toMatchObject({ accumulatedEarnings: paper.november.balanceSheet.accumulatedEarnings });
        assertPeriod(november, paper.november, roles); assertOpening(november, paper.november.openingTrialBalance, roles);
        expect(november.trialBalance.totalDebits).toBe(paper.november.periodTurnoverWithThoseTechnicalLegs);
        expect(november.trialBalance.totalCredits).toBe(paper.november.periodTurnoverWithThoseTechnicalLegs);
        const octoberAfter = await f.request<FinancialReportResponse>(periodPath('2026-10-01', '2026-10-31'));
        expect(reportSections(octoberAfter)).toEqual(reportSections(f.october));
        const afterJournals = await f.request<{ journalEntries: Array<{ id: string }> }>('/api/journal-entries');
        for (const original of f.octoberJournals.journalEntries) expect(afterJournals.journalEntries.find(row => row.id === original.id)).toEqual(original);
        const octoberGstAfter = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31');
        expect(octoberGstAfter.calculation?.fingerprint).toBe(f.octoberGst.calculation?.fingerprint);
        const cash = await f.request<FinancialReportResponse>(periodPath('2026-11-01', '2026-11-30').replace('basis=accrual', 'basis=cash'));
        expect(cash.profitLoss).toMatchObject(paper.november.profitLoss.cash);
        const gst = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-11-01&to=2026-11-30');
        const mismatchedBasis = await f.request<{ error: { code: string } }>('/api/tax/gst-preparation?from=2026-11-01&to=2026-11-30&basis=payments', 'GET', undefined, 422); expect(mismatchedBasis.error.code).toBe('GST_BASIS_MISMATCH');
        expect(gst).toMatchObject({ gstOnSales: paper.november.gst.invoice.output, gstOnPurchases: paper.november.gst.invoice.input, netGstPosition: paper.november.gst.invoice.net });
        const draft = await f.post('/api/tax-returns', { returnType: 'GST', periodStart: '2026-11-01', periodEnd: '2026-11-30', totalSales: gst.totalSales, totalPurchases: gst.totalPurchases, gstOnSales: gst.gstOnSales, gstOnPurchases: gst.gstOnPurchases, netGst: gst.netGstPosition, returnData: { preparation: { basis: 'invoice', baseCurrency: 'NZD', dueDate: '2027-01-15' }, gstReview: gst.review } });
        await f.post('/api/accounting-periods/close', { through: '2026-11-30', reason: 'Reviewed November carry-forward, bank, aging and GST', reviewed: true, expectedRevision: 1 }, 200);
        const closedJournal = await f.post<{ error: { code: string } }>('/api/journal-entries', { description: 'Rejected late November adjustment', entryDate: '2026-11-30', debitAccountId: f.cost.id, creditAccountId: f.capital.id, amount: '1.00' }, 409);
        expect(closedJournal.error.code).toBe('ACCOUNTING_PERIOD_CLOSED');
        const priorYear = await f.request<FinancialReportResponse>(periodPath('2026-04-01', '2027-03-31'));
        expect(priorYear.balanceSheet).toMatchObject({ accumulatedEarnings: paper.yearEnd.balanceSheet.accumulatedEarnings });
        assertPeriod(priorYear, paper.yearEnd, roles);
        const journalsBeforeFiscalClose = await f.request('/api/journal-entries');
        await f.post('/api/accounting-periods/close', { through: '2027-03-31', reason: 'Reviewed year end and unpaid source balances', reviewed: true, expectedRevision: 2 }, 200);
        expect(await f.request('/api/journal-entries')).toEqual(journalsBeforeFiscalClose);
        const invoice = await f.post('/api/invoices', { customerId: f.november.customer.id, date: '2027-04-01', dueDate: '2027-04-30', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'April new-year service', quantity: '1', rate: '200' }] });
        await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
        await f.post('/api/payments', { invoiceId: invoice.id, amount: '230', paymentDate: '2027-04-01', paymentMethod: 'bank_transfer' });
        const bill = await f.post('/api/bills', { vendorId: f.november.vendor.id, issueDate: '2027-04-01', dueDate: '2027-04-30', taxInclusive: false, currency: 'NZD', lines: [{ description: 'April new-year subcontracting', quantity: '1', unitPrice: '100', taxRate: '15', accountId: f.cost.id }] });
        await f.post(`/api/bills/${bill.id}/receive`, {}, 200);
        const april = await f.request<FinancialReportResponse>(periodPath('2027-04-01', '2027-04-30', '&comparisonFrom=2026-04-01&comparisonTo=2027-03-31'));
        expect(april.balanceSheet).toMatchObject({ accumulatedEarnings: paper.april.balanceSheet.accumulatedEarnings });
        assertPeriod(april, paper.april, roles); assertOpening(april, paper.april.openingTrialBalance, roles);
        expect(april.comparison).toMatchObject(paper.comparisons.financialYears[0]);
        expect(reportSections(await f.request<FinancialReportResponse>(periodPath('2026-11-01', '2026-11-30')))).toEqual(reportSections(november));
        expect(reportSections(await f.request<FinancialReportResponse>(periodPath('2026-04-01', '2027-03-31')))).toEqual(reportSections(priorYear));
        const options = await f.request('/api/reports/options'); expect(options).toMatchObject({ financialYearStartMonth: 4, financialYearStartDay: 1 });
        const quarterly = await f.request<FinancialReportResponse>(periodPath('2026-10-01', '2027-06-30', '&columns=quarter'));
        for (const [index, period] of paper.comparisons.calendarQuarters.entries()) expect(quarterly.columns!.periods[index].profitLoss).toMatchObject({ revenue: period.revenue, expenses: period.expenses, netIncome: period.netIncome });
        const monthly = await f.request<FinancialReportResponse>(periodPath('2026-10-01', '2027-04-30', '&columns=month'));
        for (const [index, period] of paper.comparisons.months.entries()) expect(monthly.columns!.periods[index].profitLoss).toMatchObject({ revenue: period.revenue, expenses: period.expenses, netIncome: period.netIncome });
        const aprilCash = await f.request<FinancialReportResponse>(periodPath('2027-04-01', '2027-04-30', '&comparisonFrom=2026-04-01&comparisonTo=2027-03-31').replace('basis=accrual', 'basis=cash')); expect(aprilCash.profitLoss).toMatchObject(paper.april.profitLoss.cash); expect(aprilCash.comparison).toMatchObject(paper.yearEnd.profitLoss.cash);
        const aprilGst = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2027-04-01&to=2027-04-30'); expect(aprilGst).toMatchObject({ gstOnSales: '30.00', gstOnPurchases: '15.00', netGstPosition: '15.00' });
        const retainedDraft = await f.request(`/api/tax-returns/${draft.id}`); expect(retainedDraft).toEqual(draft);
        const directory = process.env.LEDGERCRAFT_SECOND_MONTH_EVIDENCE_DIR
          ? resolve(process.env.LEDGERCRAFT_SECOND_MONTH_EVIDENCE_DIR)
          : fileURLToPath(new URL('./second-month-evidence/', getDatabaseUrl()));
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'results.json'), JSON.stringify({ scope: 'Real HTTP and SQLite acceptance, not UI', clock: '2027-05-01T00:00:00Z; Date-only fake clock for future close guard', expectedVersion: paper.version, octoberBefore: f.october, octoberAfter, november, novemberCash: cash, novemberGst: gst, rejectedAlternativeGstBasis: mismatchedBasis, gstDraft: retainedDraft, yearEnd: priorYear, april, aprilCash, aprilGst, monthly, quarterly, noSyntheticFiscalClosingJournal: true, overpaymentRejection: f.overpayment, recoveredReceipt: f.recoveredReceipt, commands: f.commands }, null, 2) + '\n', { flag: 'wx' });
      } finally { await f.sql.end(); }
    }); } finally { vi.useRealTimers(); }
  }, 60_000);
  it('preserves the historical year-end evidence when the suite runs', async () => {
    expect(await readFile(historicalEvidencePath, 'utf8')).toBe(historicalEvidenceBefore);
  });

});
