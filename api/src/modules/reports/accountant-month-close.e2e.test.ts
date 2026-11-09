import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { creditNoteSchema, financialReportResponseSchema, gstPreparationResponseSchema, invoiceSchema } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { decimal, roundMoney } from '../invoices/money';

// Independent accountant's working paper, fixed before invoking report code.
// Sales2000 + zero-rated500 - credit200; costs1000 + expense200.
// Cash10000 + receipt1150 - supplier575 - expense230.
const expected = {
  october: { revenue: '2300.00', expenses: '1200.00', profit: '1100.00', cash: '10345.00', ar: '1420.00', ap: '575.00', outputGst: '270.00', inputGst: '180.00', netGst: '90.00' },
  cashGst: { totalSales: '1150.00', totalPurchases: '805.00', gstOnSales: '150.00', gstOnPurchases: '105.00', netGstPosition: '45.00' },
};

describe('independent accountant month-close acceptance', () => {
  it('agrees to fixed October working papers and preserves that close after November settlements, reversals and a credit reversal', async () => withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
      const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
      const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'Month-close accountant', email: `month-close-${crypto.randomUUID()}@example.test`, password: 'Local-MonthClose-2026!' }) });
      expect(signup.status).toBe(200);
      const headers = { ...origin, Cookie: signup.headers.getSetCookie().map(row => row.split(';')[0]).join('; ') };
      async function request<T = { id: string }>(path: string, method = 'GET', body?: unknown, status = 200): Promise<T> {
        const response = await app.request(path, { method, headers: { ...headers, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const text = await response.text();
        expect(response.status, `${method} ${path}: ${text}`).toBe(status);
        return JSON.parse(text) as T;
      }
      const post = <T = { id: string }>(path: string, body: unknown, status = 201) => request<T>(path, 'POST', body, status);
      await request('/api/business-profile', 'PUT', { name: 'Kauri Month Close Limited', email: 'accounts@month-close.example.test', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2020-01-01', gstAccountingBasis: 'invoice', gstFilingFrequency: 'monthly', gstPeriodAnchor: 10 });
      const customer = await post('/api/customers', { name: 'October client', email: 'client@example.test' });
      const invoice = await post('/api/invoices', { customerId: customer.id, date: '2026-10-05', dueDate: '2026-10-31', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'October services', quantity: '1', rate: '2000' }] });
      await request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      const zeroRated = await post('/api/invoices', { customerId: customer.id, date: '2026-10-06', dueDate: '2026-10-31', taxInclusive: false, taxRate: '0', currency: 'NZD', items: [{ description: 'Zero-rated services', quantity: '1', rate: '500' }] });
      await request(`/api/invoices/${zeroRated.id}`, 'PATCH', { status: 'sent' });
      await post('/api/payments', { invoiceId: invoice.id, amount: '1150', paymentDate: '2026-10-10', paymentMethod: 'bank_transfer' });
      await post('/api/expenses', { description: 'October paid operating receipt', amount: '230', taxAmount: '30', gstTreatment: 'standard', currency: 'NZD', expenseDate: '2026-10-15', status: 'approved' });
      const chart = await request<{ accounts: Array<{ id: string; accountNumber: string }> }>('/api/accounts');
      const cash = chart.accounts.find(row => row.accountNumber === '1110');
      const cost = chart.accounts.find(row => row.accountNumber === '5000');
      expect(cash).toBeDefined(); expect(cost).toBeDefined();
      const capital = await post('/api/accounts', { name: 'Reviewed owner capital', type: 'custom', accountClass: 'equity', accountNumber: '3000', currency: 'NZD' });
      await post('/api/journal-entries/opening-balances', { date: '2026-10-01', reference: 'Reviewed initial capital working paper', reviewed: true, lines: [{ accountId: cash!.id, debit: '10000', credit: '0' }, { accountId: capital.id, debit: '0', credit: '10000' }] });
      const bank = await post('/api/bank-accounts', { accountName: 'Supplier operating bank', accountNumber: '12-0000-0000001-00', bankName: 'Synthetic Bank', accountType: 'checking', currency: 'NZD' });
      const vendor = await post('/api/vendors', { name: 'October subcontractor' });
      const bill = await post('/api/bills', { vendorId: vendor.id, issueDate: '2026-10-08', dueDate: '2026-10-31', taxInclusive: true, currency: 'NZD', lines: [{ description: 'October subcontracting', quantity: '1', unitPrice: '1150', taxRate: '15', accountId: cost!.id }] });
      await post(`/api/bills/${bill.id}/receive`, {}, 200);
      await post(`/api/bills/${bill.id}/payments`, { bankAccountId: bank.id, amount: '575', paymentDate: '2026-10-12' });
      const credit = creditNoteSchema.parse(await post('/api/credit-notes', { invoiceId: invoice.id, issueDate: '2026-10-20', reason: 'Reviewed service reduction agreed with client', taxInclusive: false, taxRate: '15', items: [{ description: 'Service reduction', quantity: '1', rate: '200' }] }));
      expect(credit).toMatchObject({ total: '230.00', receivableAmount: '230.00', customerCreditAmount: '0.00' });
      expect(invoiceSchema.parse(await request(`/api/invoices/${invoice.id}`))).toMatchObject({ total: '2300.00', totalPaid: '1150.00', totalCredited: '230.00', balanceDue: '920.00' });
      const report = async (to: string) => financialReportResponseSchema.parse(await request(`/api/reports/financial?from=2026-10-01&to=${to}&basis=accrual&baseCurrency=NZD`));
      const gst = async (from: string, to: string, basis = 'invoice') => gstPreparationResponseSchema.parse(await request(`/api/tax/gst-preparation?from=${from}&to=${to}&basis=${basis}`));
      const october = await report('2026-10-31');
      expect(october.profitLoss).toMatchObject({ revenue: expected.october.revenue, expenses: expected.october.expenses, netIncome: expected.october.profit });
      expect(october.cashFlow.closingCash).toBe(expected.october.cash);
      expect(october.receivablesAging.total).toBe(expected.october.ar); expect(october.payablesAging.total).toBe(expected.october.ap);
      expect(october.taxSummary).toMatchObject({ outputGst: '270.00', inputGst: '180.00', netGst: '90.00' });
      expect(october.balanceSheet).toMatchObject({ assets: '11945.00', liabilities: '845.00', equity: '11100.00', balanced: true });
      expect(october.trialBalance.balanced).toBe(true);
      const invoiceGst = await gst('2026-10-01', '2026-10-31');
      expect(invoiceGst).toMatchObject({ totalSales: '2570.00', totalPurchases: '1380.00', gstOnSales: '270.00', gstOnPurchases: '180.00', netGstPosition: '90.00' });
      const cashGst = await request<{ error: { code: string } }>('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31&basis=payments', 'GET', undefined, 422);
      expect(cashGst.error.code).toBe('GST_BASIS_MISMATCH');
      const octoberJournalLines = await db.select().from(journalEntryLines);
      expect(await db.select().from(journalEntries)).toHaveLength(8);
      await post('/api/payments', { invoiceId: invoice.id, amount: '920', paymentDate: '2026-11-02', paymentMethod: 'bank_transfer' });
      const zeroReceipt = await post('/api/payments', { invoiceId: zeroRated.id, amount: '500', paymentDate: '2026-11-02', paymentMethod: 'bank_transfer' });
      await post(`/api/bills/${bill.id}/payments`, { bankAccountId: bank.id, amount: '575', paymentDate: '2026-11-02' });
      const settled = await report('2026-11-02');
      expect(settled.receivablesAging.total).toBe('0.00'); expect(settled.payablesAging.total).toBe('0.00'); expect(settled.cashFlow.closingCash).toBe('11190.00');
      await post(`/api/payments/${zeroReceipt.id}/reverse`, { reversalDate: '2026-11-03', reason: 'Bank returned zero-rated customer receipt' }, 200);
      const reversed = await report('2026-11-03');
      expect(reversed.receivablesAging.total).toBe('500.00'); expect(reversed.cashFlow.closingCash).toBe('10690.00');
      await post(`/api/credit-notes/${credit.id}/reverse`, { date: '2026-11-04', reason: 'Original agreed service reduction withdrawn' }, 200);
      const creditReversed = await report('2026-11-04');
      expect(creditReversed.receivablesAging.total).toBe('730.00'); expect(creditReversed.profitLoss.netIncome).toBe('1300.00');
      const closedAfter = await report('2026-10-31');
      for (const section of ['profitLoss', 'cashFlow', 'balanceSheet', 'receivablesAging', 'payablesAging', 'trialBalance', 'taxSummary'] as const) expect(closedAfter[section]).toEqual(october[section]);
      // Calculations are freshly timestamped; every monetary value, source ID,
      // source fingerprint and all remaining audit fields must remain equal.
      const stableGst = (value: Awaited<ReturnType<typeof gst>>) => ({ ...value, ...(value.calculation ? { calculation: { ...value.calculation, calculatedAt: '<fresh calculation time>' } } : {}) });
      expect(stableGst(await gst('2026-10-01', '2026-10-31'))).toEqual(stableGst(invoiceGst));
      expect((await request<{ error: { code: string } }>('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31&basis=payments', 'GET', undefined, 422)).error.code).toBe('GST_BASIS_MISMATCH');
      const novemberCashGst = await request<{ error: { code: string } }>('/api/tax/gst-preparation?from=2026-11-01&to=2026-11-30&basis=payments', 'GET', undefined, 422);
      expect(novemberCashGst.error.code).toBe('GST_BASIS_MISMATCH');
      const entries = await db.select().from(journalEntries);
      const lines = await db.select().from(journalEntryLines);
      expect(entries).toHaveLength(13);
      for (const line of octoberJournalLines) expect(lines.find(row => row.id === line.id)).toEqual(line);
      for (const entry of entries) {
        const entryLines = lines.filter(row => row.journalEntryId === entry.id);
        const debits = roundMoney(entryLines.reduce((sum, row) => sum.add(row.debitAmount), decimal(0)));
        const credits = roundMoney(entryLines.reduce((sum, row) => sum.add(row.creditAmount), decimal(0)));
        expect(debits, entry.description).toBe(credits);
        expect(debits).toBe(roundMoney(entry.totalAmount));
      }
      const directory = process.env.ACCOUNTING_EVIDENCE_DIR;
      if (directory) {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'accountant-month-close.json'), JSON.stringify({ expected, actual: { october, invoiceGst, cashGst, settled, reversed, creditReversed, closedAfter, novemberCashGst }, journalChecks: { originalEntries: 8, totalEntries: entries.length, originalLinesPreserved: true, allEntriesIndividuallyBalanced: true } }, null, 2) + '\n');
      }
    } finally { await sql.end(); }
  }));
});
