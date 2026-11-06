import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { decimal, roundMoney } from '../invoices/money';

type TestApp = ReturnType<typeof createApp>;
// Loose JSON shape for reading nested API responses in this scenario test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const jsonHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};
// Opt-in evidence output, e.g. GST_EVIDENCE_DIR=../.gst-evidence pnpm test:api.
const evidenceDirectory = process.env.GST_EVIDENCE_DIR;

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  if (!evidenceDirectory) return;
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(join(evidenceDirectory, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function requestJson(
  app: TestApp,
  path: string,
  init: RequestInit,
  expectedStatus: number,
): Promise<Json> {
  const response = await app.request(path, init);
  expect(response.status, `${init.method ?? 'GET'} ${path}`).toBe(expectedStatus);
  return await response.json() as Json;
}

async function signUp(app: TestApp, name: string): Promise<string> {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`,
      password: 'Local-gst-scenario-123!',
    }),
  });
  expect(response.status).toBeLessThan(400);
  return cookieHeader(response);
}

async function setUpOrganisation(app: TestApp, name: string) {
  const cookie = await signUp(app, name);
  const headers = { ...jsonHeaders, Cookie: cookie };
  await requestJson(app, '/api/business-profile', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      name: `${name} Limited`,
      email: `${name.toLowerCase().replace(/\s+/g, '-')}@example.nz`,
      country: 'NZ',
      defaultTaxRate: '15',
      gstRegistrationStatus: 'registered',
      taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'invoice', gstFilingFrequency: 'six_monthly', gstPeriodAnchor: 6,
      invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
      invoiceNumberSequence: 1,
    }),
  }, 200);
  const customer = await requestJson(app, '/api/customers', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: `${name} Customer`, email: 'customer@example.nz', country: 'NZ' }),
  }, 201);
  const expenseAccount = await requestJson(app, '/api/accounts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Operating Expenses',
      type: 'expense',
      accountNumber: '5000',
      accountClass: 'expense',
    }),
  }, 201);
  const vendor = await requestJson(app, '/api/vendors', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: `${name} Supplier`, paymentTermDays: 20 }),
  }, 201);
  return { cookie, headers, customerId: customer.id as string, expenseAccountId: expenseAccount.id as string, vendorId: vendor.id as string };
}

async function createPostedInvoice(
  app: TestApp,
  headers: Record<string, string>,
  customerId: string,
  input: { date: string; amount: string; taxRate?: string; taxInclusive?: boolean; description: string; currency?: string },
) {
  const draft = await requestJson(app, '/api/invoices', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({
      customerId,
      date: input.date,
      dueDate: input.date,
      currency: input.currency ?? 'NZD',
      taxInclusive: input.taxInclusive ?? false,
      taxRate: input.taxRate ?? '15',
      items: [{ description: input.description, quantity: '1', rate: input.amount }],
    }),
  }, 201);
  return requestJson(app, `/api/invoices/${draft.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'sent' }),
  }, 200);
}

async function createReceivedBill(
  app: TestApp,
  headers: Record<string, string>,
  input: { vendorId: string; accountId: string; date: string; gross: string; description: string },
) {
  const draft = await requestJson(app, '/api/bills', {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({
      vendorId: input.vendorId,
      issueDate: input.date,
      dueDate: input.date,
      currency: 'NZD',
      taxInclusive: true,
      lines: [{
        description: input.description,
        quantity: '1',
        unitPrice: input.gross,
        taxRate: '15',
        accountId: input.accountId,
      }],
    }),
  }, 201);
  return requestJson(app, `/api/bills/${draft.id}/receive`, {
    method: 'POST',
    headers,
    body: '{}',
  }, 200);
}

async function financialReport(app: TestApp, cookie: string, from = '2026-04-01', to = '2026-06-30') {
  return requestJson(
    app,
    `/api/reports/financial?from=${from}&to=${to}&basis=accrual&baseCurrency=NZD`,
    { headers: { Cookie: cookie } },
    200,
  );
}

async function generalLedger(app: TestApp, cookie: string, from = '2026-04-01', to = '2026-06-30') {
  return requestJson(
    app,
    `/api/reports/general-ledger?from=${from}&to=${to}&basis=accrual&baseCurrency=NZD`,
    { headers: { Cookie: cookie } },
    200,
  );
}

function linesFor(ledger: Json, referenceType: string, referenceId: string) {
  return (ledger.lines as Json[])
    .filter((line) => line.referenceType === referenceType && line.referenceId === referenceId)
    .map((line) => ({ accountNumber: line.accountNumber, debit: line.debit, credit: line.credit }));
}

function rowFor(report: Json, accountNumber: string): Json | undefined {
  return (report.trialBalance.rows as Json[]).find((row) => row.accountNumber === accountNumber);
}

function expectGst(report: Json, output: string, input: string, net: string, position: 'payable' | 'refundable' | 'nil') {
  expect.soft(report.taxSummary.collected).toBe(output);
  expect.soft(report.taxSummary.paid).toBe(input);
  expect.soft(report.taxSummary.netPayable).toBe(net);
  expect.soft(report.taxSummary.outputGst).toBe(output);
  expect.soft(report.taxSummary.inputGst).toBe(input);
  expect.soft(report.taxSummary.netGst).toBe(net);
  expect.soft(report.taxSummary.position).toBe(position);
}

describe('NZ consulting business accountant acceptance', () => {
  it('reconciles partial settlements, expenses, supplier debt, capital and transfers to independent books', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const business = await setUpOrganisation(app, 'Harbour Consulting');
        const post = (path: string, body: Json, status = 201) => requestJson(app, path, {
          method: 'POST', headers: { ...business.headers, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body),
        }, status);
        const initialized = await post('/api/accounts/initialize', {}, 200);
        const bankLedger = initialized.accounts.find((a: Json) => a.accountNumber === '1110');
        const capital = await post('/api/accounts', { name: 'Owner capital', type: 'equity', accountClass: 'equity', accountNumber: '3000' });
        const capitalJournal = await post('/api/journal-entries', {
          description: 'Owner funds business', entryDate: '2026-04-01', debitAccountId: bankLedger.id,
          creditAccountId: capital.id, amount: '5000.00',
        });
        await requestJson(app, `/api/journal-entries/${capitalJournal.id}`, {
          method: 'PATCH', headers: business.headers, body: JSON.stringify({ status: 'posted' }),
        }, 200);
        const operating = await post('/api/bank-accounts', { accountName: 'Operating', accountNumber: '12-3456-000001-00', bankName: 'Test Bank', accountType: 'checking', openingBalance: '5000.00' });
        const savings = await post('/api/bank-accounts', { accountName: 'Savings', accountNumber: '12-3456-000002-00', bankName: 'Test Bank', accountType: 'savings' });
        for (const [amount, paid] of [['1000.00', '1150.00'], ['400.00', '230.00']]) {
          const invoice = await createPostedInvoice(app, business.headers, business.customerId, { date: '2026-04-05', amount, description: 'Consulting services' });
          await post('/api/payments', { invoiceId: invoice.id, amount: paid, paymentMethod: 'bank_transfer', paymentDate: '2026-04-10' });
        }
        for (const [amount, taxAmount, gstTreatment] of [['230.00', '30.00', 'standard'], ['50.00', '0.00', 'exempt']]) {
          await post('/api/expenses', { description: 'Business operating cost', amount, taxAmount, gstTreatment, currency: 'NZD', expenseDate: '2026-04-12', status: 'approved', paymentMethod: 'bank_transfer' });
        }
        const bill = await createReceivedBill(app, business.headers, { vendorId: business.vendorId, accountId: business.expenseAccountId, date: '2026-04-15', gross: '345.00', description: 'Subcontractor services' });
        const billSettlement = await post(`/api/bills/${bill.id}/payments`, { bankAccountId: operating.id, amount: '69.00', paymentDate: '2026-04-20' });
        const beforeTransfer = await financialReport(app, business.cookie);
        await post('/api/bank-transfers', { sourceAccountId: operating.id, destinationAccountId: savings.id, transactionDate: '2026-04-22', amount: '1000.00', description: 'Reserve cash' });
        const report = await financialReport(app, business.cookie);
        // Independently computed worksheet: 1400 sales - (200 + 50 + 300) costs.
        expect(report.profitLoss).toMatchObject({ revenue: '1400.00', expenses: '550.00', netIncome: '850.00' });
        expect(rowFor(report, '1200')).toMatchObject({ balance: '230.00' });
        expect(rowFor(report, '2100')).toMatchObject({ balance: '276.00' });
        expectGst(report, '210.00', '75.00', '135.00', 'payable');
        expect(report.trialBalance.balanced).toBe(true);
        // Gross presentation: cash6031 + AR230 + inputGST75; AP276 + outputGST210.
        expect(report.balanceSheet).toMatchObject({ assets: '6336.00', liabilities: '486.00', equity: '5850.00', balanced: true });
        expect(report.cashFlow.closingCash).toBe('6031.00');
        const nextMonth = await financialReport(app, business.cookie, '2026-05-01', '2026-05-31');
        expect(nextMonth.profitLoss.netIncome).toBe('0.00');
        expect(nextMonth.balanceSheet).toMatchObject({ assets: '6336.00', liabilities: '486.00', equity: '5850.00', balanced: true });
        expect(report.profitLoss).toEqual(beforeTransfer.profitLoss);
        expectGst(beforeTransfer, '210.00', '75.00', '135.00', 'payable');
        const ledger = await generalLedger(app, business.cookie);
        expect(linesFor(ledger, 'bill_payment', billSettlement.payments[0].id)).toContainEqual({
          accountNumber: `BANK-${operating.id.slice(0, 8).toUpperCase()}`, debit: '0.00', credit: '69.00',
        });
        const entries = new Map<string, Json[]>();
        for (const line of ledger.lines) entries.set(line.journalEntryId, [...(entries.get(line.journalEntryId) ?? []), line]);
        for (const [id, lines] of entries) {
          expect(roundMoney(lines.reduce<ReturnType<typeof decimal>>((sum, line) => sum.add(line.debit).sub(line.credit), decimal(0))), id).toBe('0.00');
        }
        const other = await setUpOrganisation(app, 'Separate Consulting');
        const prepared = await post('/api/tax-returns', {
          periodStart: '2026-04-01', periodEnd: '2026-06-30', returnType: 'GST',
          totalSales: '1610.00', totalPurchases: '625.00', gstOnSales: '210.00', gstOnPurchases: '75.00', netGst: '135.00',
          returnData: { basis: 'invoice', accountantWorksheet: { standardRatedPurchases: '575.00', exemptPurchases: '50.00' } },
        });
        expect(prepared).toMatchObject({ status: 'draft', gstOnSales: '210.00', gstOnPurchases: '75.00', netGst: '135.00' });
        const hiddenReturn = await app.request(`/api/tax-returns/${prepared.id}`, { headers: other.headers });
        expect(hiddenReturn.status).toBe(404);
        const separate = await financialReport(app, other.cookie);
        expect(separate.profitLoss.netIncome).toBe('0.00');
        expect(separate.taxSummary.netGst).toBe('0.00');
        const gstPreparation = await requestJson(app, '/api/tax/gst-preparation?from=2026-04-01&to=2026-06-30', { headers: business.headers }, 200);
        expect(gstPreparation).toMatchObject({ basis: 'invoice', from: '2026-04-01', to: '2026-06-30', baseCurrency: 'NZD', totalSales: '1610.00', totalPurchases: '625.00', gstOnSales: '210.00', gstOnPurchases: '75.00', netGstPosition: '135.00', warnings: [] });
        const chartOfAccounts = await requestJson(app, '/api/accounts', { headers: business.headers }, 200);
        await writeEvidence('consulting-business-worksheet.json', { report, generalLedger: ledger, preparedReturn: prepared, chartOfAccounts, gstPreparation });
      } finally { await sql.end(); }
    });
  });
});
