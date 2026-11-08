import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabaseUrl } from '../../env';
import { financialReportResponseSchema, gstPreparationResponseSchema, creditNoteSchema } from '@ledgercraft/contracts';
import { withTestDb } from '../../test/harness';
import { decimal, roundMoney } from '../invoices/money';
import { journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { fullMonthCloseFixture } from './full-month-close.test-helper';

const historicalEvidencePath = new URL('../../../../docs/evidence/full-month-close/api/results.json', import.meta.url);
let historicalEvidenceBefore: string;
beforeAll(async () => { historicalEvidenceBefore = await readFile(historicalEvidencePath, 'utf8'); });

// Monetary expectations are frozen in the independently prepared working paper.
describe('full October close through real authenticated HTTP and SQLite', () => {
  it('reconciles prescribed sources, five bank lines, all reports and a retained GST draft', async () => withTestDb(async () => {
    const f = await fullMonthCloseFixture();
    try {
      const expected = JSON.parse(await readFile(new URL('../../../../docs/evidence/full-month-close/expected.json', import.meta.url), 'utf8'));
      const reportPath = '/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual&baseCurrency=NZD';
      expect(creditNoteSchema.parse(await f.request(`/api/credit-notes/${f.credits[0].id}`))).toMatchObject({ receivableAmount: '230.00', customerCreditAmount: '0.00', refundAvailable: '0.00' });
      expect(creditNoteSchema.parse(f.refund)).toMatchObject({ receivableAmount: '0.00', customerCreditAmount: '115.00', refundedAmount: '115.00', refundAvailable: '0.00' });
      const before = financialReportResponseSchema.parse(await f.request(reportPath));
      expect(before.profitLoss).toMatchObject({ revenue: '2700.00', expenses: '1200.00', netIncome: '1500.00' });
      expect(before.balanceSheet).toMatchObject({ assets: '12480.00', liabilities: '980.00', equity: '11500.00', balanced: true });
      expect(before.cashFlow.closingCash).toBe('11380.00');
      expect(before.receivablesAging.total).toBe('920.00'); expect(before.payablesAging.total).toBe('575.00');
      const economicLines = await f.db.select().from(journalEntryLines);
      const imported = await f.post<{ transactions: Array<{ id: string }> }>('/api/bank-transactions/import', { bankAccountId: f.bank.id, transactions: [
        { transactionDate: '2026-10-05', amount: '1150', type: 'credit', description: 'Client A receipt' },
        { transactionDate: '2026-10-06', amount: '1150', type: 'credit', description: 'Client B receipt' },
        { transactionDate: '2026-10-08', amount: '575', type: 'debit', description: 'Supplier payment' },
        { transactionDate: '2026-10-09', amount: '230', type: 'debit', description: 'Operating receipt' },
        { transactionDate: '2026-10-12', amount: '115', type: 'debit', description: 'Client B refund' },
      ] });
      const session = await f.post('/api/reconciliation-sessions', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '10000', statementClosingBalance: '11380' });
      creditNoteSchema.parse(f.refund);
      const books = await f.request<{ entries: Array<{ id: string; type: string }> }>('/api/book-entries?from=2026-10-01&to=2026-10-31');
      const refund = books.entries.find(row => row.type === 'credit_refund');
      expect(refund).toBeDefined();
      const sources = [ ['payment', f.receipts[0].id], ['payment', f.receipts[1].id], ['bill_payment', f.supplier.id], ['expense', f.expense.id], ['credit_refund', refund!.id] ];
      for (const [i, source] of sources.entries()) await f.post(`/api/reconciliation-sessions/${session.id}/matches`, { bankTransactionId: imported.transactions[i].id, bookItemType: source[0], bookItemId: source[1], status: 'confirmed' });
      const refundInput = { bankTransactionId: imported.transactions[4].id, bookItemType: 'credit_refund', bookItemId: refund!.id, status: 'confirmed' };
      const retry = await f.post(`/api/reconciliation-sessions/${session.id}/matches`, refundInput);
      expect(retry).toMatchObject({ journalEntryId: refund!.id, difference: '0.00' });
      const completed = await f.post(`/api/reconciliation-sessions/${session.id}/complete`, {}, 200);
      expect(completed).toMatchObject({ status: 'completed', bookOpeningBalance: '10000.00', bookClosingBalance: '11380.00', difference: '0.00', matchedCount: 5 });
      const matchedLines = await f.db.select().from(journalEntryLines);
      for (const line of economicLines) expect(matchedLines.find(row => row.id === line.id)).toEqual(line);
      const after = financialReportResponseSchema.parse(await f.request(reportPath));
      expect(after.profitLoss).toMatchObject({ revenue: expected.profitLoss.accrual.revenue, expenses: expected.profitLoss.accrual.expenses, netIncome: expected.profitLoss.accrual.netIncome });
      expect(after.balanceSheet).toMatchObject({ assets: expected.balanceSheet.separateGstControls.assets, liabilities: expected.balanceSheet.separateGstControls.liabilities, equity: expected.balanceSheet.separateGstControls.equity, balanced: true });
      expect(after.cashFlow.closingCash).toBe(expected.cashFlow.closingCash);
      expect(after.taxSummary).toMatchObject({ outputGst: expected.gst.invoice.output, inputGst: expected.gst.invoice.input, netGst: expected.gst.invoice.net });
      expect(after.receivablesAging).toEqual(before.receivablesAging); expect(after.payablesAging).toEqual(before.payablesAging);
      for (const section of ['receivablesAging', 'payablesAging'] as const) {
        const { items: _items, ...buckets } = after[section];
        const { invoiceA: _a, invoiceB: _b, ...expectedBuckets } = expected[section];
        expect(buckets).toEqual(expectedBuckets);
      }
      const roles: Record<string, string> = { bank: f.bankNumber, capital: '3000', receivables: '1200', sales: '4000', outputGst: '2200', inputGst: '2150', operatingCosts: '5000', payables: '2100', customerCredit: '2300' };
      for (const row of expected.trialBalance.rows) {
        const actual = after.trialBalance.rows.find(item => item.accountNumber === roles[row.accountRole]);
        expect(actual, row.accountRole).toMatchObject({ closingDebit: row.debit, closingCredit: row.credit });
      }
      expect(roundMoney(after.trialBalance.rows.reduce((sum, row) => sum.add(row.closingDebit), decimal(0)))).toBe(expected.trialBalance.totalDebits);
      expect(roundMoney(after.trialBalance.rows.reduce((sum, row) => sum.add(row.closingCredit), decimal(0)))).toBe(expected.trialBalance.totalCredits);
      expect(after.trialBalance).toMatchObject({ closingDebits: expected.trialBalance.totalDebits, closingCredits: expected.trialBalance.totalCredits });
      const cashReport = financialReportResponseSchema.parse(await f.request(reportPath.replace('basis=accrual', 'basis=cash')));
      expect(cashReport.profitLoss).toMatchObject(expected.profitLoss.cash);
      const alternateGst: Partial<Record<'payments' | 'hybrid', ReturnType<typeof gstPreparationResponseSchema.parse>>> = {};
      for (const basis of ['payments', 'hybrid'] as const) {
        await f.request('/api/tax/gst-settings', 'PUT', { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-10-01', gstAccountingBasis: basis, gstFilingFrequency: 'monthly', gstPeriodAnchor: 10 });
        const figures = gstPreparationResponseSchema.parse(await f.request('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31'));
        alternateGst[basis] = figures;
        expect(figures).toMatchObject({ totalSales: expected.gst[basis].salesGross, totalPurchases: expected.gst[basis].purchaseGross, gstOnSales: expected.gst[basis].output, gstOnPurchases: expected.gst[basis].input, netGstPosition: expected.gst[basis].net });
      }
      await f.request('/api/tax/gst-settings', 'PUT', { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-10-01', gstAccountingBasis: 'invoice', gstFilingFrequency: 'monthly', gstPeriodAnchor: 10 });
      const gst = gstPreparationResponseSchema.parse(await f.request('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31'));
      expect(gst).toMatchObject({ totalSales: '3105.00', totalPurchases: '1380.00', gstOnSales: '405.00', gstOnPurchases: '180.00', netGstPosition: '225.00' });
      const draft = await f.post('/api/tax-returns', { periodStart: '2026-10-01', periodEnd: '2026-10-31', returnType: 'GST', totalSales: gst.totalSales, totalPurchases: gst.totalPurchases, gstOnSales: gst.gstOnSales, gstOnPurchases: gst.gstOnPurchases, netGst: gst.netGstPosition, returnData: { preparation: { basis: 'invoice', baseCurrency: 'NZD', dueDate: '2026-11-30' }, gstReview: gst.review } });
      expect(gst.calculation).toMatchObject({ version: 'gst-ledger-v2', mappingStatus: 'supported', requiresReview: false, myIrBoxes: { '5': expected.gst.invoice.salesGross, '8': expected.gst.invoice.output, '11': expected.gst.invoice.purchaseGross, '12': expected.gst.invoice.input, '15': expected.gst.invoice.net } });
      const originalJournalLines = await f.db.select().from(journalEntryLines);
      const retained = await f.request(`/api/tax-returns/${draft.id}`);
      expect(retained).toMatchObject({ status: 'draft', netGst: expected.gst.invoice.net, returnData: { gstCalculation: { fingerprint: gst.calculation?.fingerprint, version: 'gst-ledger-v2', figures: gst.calculation?.figures } } });
      await f.post('/api/payments', { invoiceId: f.invoices[0].id, amount: '920', paymentDate: '2026-11-02', paymentMethod: 'bank_transfer' });
      await f.post(`/api/bills/${f.bill.id}/payments`, { bankAccountId: f.bank.id, amount: '575', paymentDate: '2026-11-02' });
      expect(await f.request(`/api/tax-returns/${draft.id}`)).toEqual(retained);
      const currentLines = await f.db.select().from(journalEntryLines);
      for (const line of originalJournalLines) expect(currentLines.find(row => row.id === line.id)).toEqual(line);
      for (const entry of await f.db.select().from(journalEntries)) {
        const lines = currentLines.filter(row => row.journalEntryId === entry.id);
        const debit = roundMoney(lines.reduce((sum, row) => sum.add(row.debitAmount), decimal(0)));
        const credit = roundMoney(lines.reduce((sum, row) => sum.add(row.creditAmount), decimal(0)));
        expect(debit).toBe(credit); expect(debit).toBe(entry.totalAmount);
      }
      const stableGst = (value: typeof gst) => ({ ...value, calculation: value.calculation ? { ...value.calculation, calculatedAt: '<fresh time>' } : value.calculation });
      expect(stableGst(gstPreparationResponseSchema.parse(await f.request('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31')))).toEqual(stableGst(gst));
      const historical = financialReportResponseSchema.parse(await f.request(reportPath));
      for (const section of ['profitLoss', 'balanceSheet', 'cashFlow', 'trialBalance', 'taxSummary', 'receivablesAging', 'payablesAging'] as const) expect(historical[section]).toEqual(after[section]);
      const dir = process.env.LEDGERCRAFT_MONTH_CLOSE_EVIDENCE_DIR
        ? resolve(process.env.LEDGERCRAFT_MONTH_CLOSE_EVIDENCE_DIR)
        : fileURLToPath(new URL('./month-close-evidence/', getDatabaseUrl()));
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'results.json'), JSON.stringify({ scope: 'Real Hono/SQLite API acceptance; not UI acceptance', expectedPaper: expected, before, after, completed, gst, alternateGst, retainedDraft: retained, historical, commands: f.commands }, null, 2), { flag: 'wx' });
      expect(after.cashFlow).toMatchObject({ openingCash: expected.cashFlow.openingCash, inflows: '2300.00', outflows: '920.00', netCashFlow: expected.cashFlow.netCashFlow, closingCash: expected.cashFlow.closingCash });
    } finally { await f.sql.end(); }
  }));
  it('refuses wrong-direction, other-bank and reused refund matches; undo preserves original refund', async () => withTestDb(async () => {
    const f = await fullMonthCloseFixture();
    try {
      const books = await f.request<{ entries: Array<{ id: string; type: string }> }>('/api/book-entries?from=2026-10-01&to=2026-10-31');
      const refund = books.entries.find(row => row.type === 'credit_refund')!;
      const session = await f.post('/api/reconciliation-sessions', { bankAccountId: f.bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '10000', statementClosingBalance: '11380' });
      const imported = await f.post<{ transactions: Array<{ id: string }> }>('/api/bank-transactions/import', { bankAccountId: f.bank.id, transactions: [{ transactionDate: '2026-10-12', amount: '115', type: 'debit', description: 'Refund source' }, { transactionDate: '2026-10-13', amount: '115', type: 'debit', description: 'Duplicate statement candidate' }, { transactionDate: '2026-10-12', amount: '115', type: 'credit', description: 'Wrong direction' }] });
      const input = { bookItemType: 'credit_refund', bookItemId: refund.id, status: 'confirmed', bankTransactionId: imported.transactions[0].id };
      await f.post(`/api/reconciliation-sessions/${session.id}/matches`, { ...input, bankTransactionId: imported.transactions[2].id }, 400);
      await f.post(`/api/reconciliation-sessions/${session.id}/matches`, { ...input, bookItemId: crypto.randomUUID() }, 400);
      const saved = await f.post(`/api/reconciliation-sessions/${session.id}/matches`, input);
      await f.post(`/api/reconciliation-sessions/${session.id}/matches`, { ...input, bankTransactionId: imported.transactions[1].id }, 409);
      expect(await f.post(`/api/reconciliation-sessions/${session.id}/matches`, input)).toMatchObject({ id: saved.id });
      await f.post(`/api/bank-transactions/${imported.transactions[0].id}/undo`, { reason: 'Review statement reference', reversalDate: '2026-10-14' }, 200);
      expect(creditNoteSchema.parse(await f.request(`/api/credit-notes/${f.credits[1].id}`))).toMatchObject({ refundedAmount: '115.00', refunds: [expect.objectContaining({ status: 'completed' })] });
      const other = await f.post('/api/bank-accounts', { accountName: 'Other bank', accountNumber: crypto.randomUUID(), bankName: 'Synthetic', accountType: 'checking', currency: 'NZD' });
      const otherSession = await f.post('/api/reconciliation-sessions', { bankAccountId: other.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '-115' });
      const otherRows = await f.post<{ transactions: Array<{ id: string }> }>('/api/bank-transactions/import', { bankAccountId: other.id, transactions: [{ transactionDate: '2026-10-12', amount: '115', type: 'debit', description: 'Other bank refund' }] });
      await f.post(`/api/reconciliation-sessions/${otherSession.id}/matches`, { ...input, bankTransactionId: otherRows.transactions[0].id }, 400);
      const rematch = await f.post(`/api/reconciliation-sessions/${session.id}/matches`, input);
      expect(rematch.id).not.toBe(saved.id);
      const signup = await f.app.request('/api/auth/sign-up/email', { method: 'POST', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Other company', email: `${crypto.randomUUID()}@example.test`, password: 'Local-othercompany123' }) });
      expect(signup.status).toBe(200);
      const outsider = signup.headers.getSetCookie().map(row => row.split(';')[0]).join('; ');
      const isolated = await f.app.request(`/api/reconciliation-sessions/${session.id}/matches`, { method: 'POST', headers: { Cookie: outsider, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      expect(isolated.status).toBe(404);
    } finally { await f.sql.end(); }
  }));

  it('preserves the historical acceptance evidence when the suite runs', async () => {
    expect(await readFile(historicalEvidencePath, 'utf8')).toBe(historicalEvidenceBefore);
  });

});
