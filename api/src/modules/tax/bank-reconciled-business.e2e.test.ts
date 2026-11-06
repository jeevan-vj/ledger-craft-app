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

describe('NZ company bank statement to general ledger', () => {
  it('reconciles capital, already recorded receipts and expenses, a supplier instalment and an internal transfer', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const business = await setUpOrganisation(app, 'Statement reconciled consulting');
        const post = (path: string, body: Json, status = 201) => requestJson(app, path, { method: 'POST', headers: business.headers, body: JSON.stringify(body) }, status);
        const operating = await post('/api/bank-accounts', { accountName: 'Operating', accountNumber: '12-0001', bankName: 'Test Bank', accountType: 'checking', openingBalance: '0.00' });
        const savings = await post('/api/bank-accounts', { accountName: 'Savings', accountNumber: '12-0002', bankName: 'Test Bank', accountType: 'savings', openingBalance: '0.00' });
        const capital = await post('/api/accounts', { name: 'Owner capital', type: 'equity', accountClass: 'equity', accountNumber: '3000' });
        const importRow = async (amount: string, type: string, description: string) => {
          const batch = await post('/api/bank-transactions/import', { bankAccountId: operating.id, transactions: [{ transactionDate: '2026-04-20', amount, type, description }] });
          return batch.transactions[0] as Json;
        };
        const funding = await importRow('5000.00', 'credit', 'Owner capital introduced');
        await post(`/api/bank-transactions/${funding.id}/accept`, { splits: [{ accountId: capital.id, amount: '5000.00' }] });
        const session = await post('/api/reconciliation-sessions', { bankAccountId: operating.id, statementStartDate: '2026-04-01', statementEndDate: '2026-06-30', statementOpeningBalance: '0.00', statementClosingBalance: '5031.00' });
        for (const [net, paid] of [['1000.00', '1150.00'], ['400.00', '230.00']]) {
          const invoice = await createPostedInvoice(app, business.headers, business.customerId, { date: '2026-04-05', amount: net, description: 'Consulting' });
          const payment = await post('/api/payments', { invoiceId: invoice.id, amount: paid, paymentDate: '2026-04-20', paymentMethod: 'bank_transfer' });
          const row = await importRow(paid, 'credit', `Receipt ${invoice.invoiceNumber}`);
          await post(`/api/reconciliation-sessions/${session.id}/matches`, { bankTransactionId: row.id, bookItemType: 'payment', bookItemId: payment.id, status: 'confirmed' });
        }
        for (const [amount, taxAmount, gstTreatment] of [['230.00', '30.00', 'standard'], ['50.00', '0.00', 'exempt']]) {
          const expense = await post('/api/expenses', { description: 'Paid operating cost', amount, taxAmount, gstTreatment, status: 'approved', expenseDate: '2026-04-20', currency: 'NZD' });
          const row = await importRow(amount, 'debit', 'Expense paid');
          await post(`/api/reconciliation-sessions/${session.id}/matches`, { bankTransactionId: row.id, bookItemType: 'expense', bookItemId: expense.id, status: 'confirmed' });
        }
        const bill = await createReceivedBill(app, business.headers, { vendorId: business.vendorId, accountId: business.expenseAccountId, date: '2026-04-15', gross: '345.00', description: 'Subcontracting' });
        const supplierPayment = await importRow('69.00', 'debit', 'Supplier instalment');
        await post(`/api/bank-transactions/${supplierPayment.id}/accept`, { allocations: [{ documentType: 'bill', documentId: bill.id, amount: '69.00' }] });
        await requestJson(app, '/api/bank-transfers', { method: 'POST', headers: { ...business.headers, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ sourceAccountId: operating.id, destinationAccountId: savings.id, transactionDate: '2026-04-22', amount: '1000.00' }) }, 201);
        const report = await financialReport(app, business.cookie);
        expect(report.profitLoss).toMatchObject({ revenue: '1400.00', expenses: '550.00', netIncome: '850.00' });
        expectGst(report, '210.00', '75.00', '135.00', 'payable');
        expect(report.cashFlow.closingCash).toBe('6031.00');
        expect(report.balanceSheet).toMatchObject({ assets: '6336.00', liabilities: '486.00', equity: '5850.00', balanced: true });
        const completedOperating = await post(`/api/reconciliation-sessions/${session.id}/complete`, {}, 200);
        expect(completedOperating).toMatchObject({ status: 'completed', bookClosingBalance: '5031.00', difference: '0.00' });
        const savingsSession = await post('/api/reconciliation-sessions', { bankAccountId: savings.id, statementStartDate: '2026-04-01', statementEndDate: '2026-06-30', statementOpeningBalance: '0.00', statementClosingBalance: '1000.00' });
        await post(`/api/reconciliation-sessions/${savingsSession.id}/complete`, {}, 200);
        expect((await post(`/api/reconciliation-sessions/${session.id}/complete`, {}, 200)).reconciledAt).toBe(completedOperating.reconciledAt);
        await post(`/api/bank-transactions/${funding.id}/undo`, { reason: 'Cannot change a completed statement', reversalDate: '2026-04-22' }, 409);
        const banks = await requestJson(app, '/api/bank-accounts', { headers: business.headers }, 200);
        for (const [bank, expected] of [[operating, '5031.00'], [savings, '1000.00']] as const) {
          expect(banks.bankAccounts.find((row: Json) => row.id === bank.id).currentBalance).toBe(expected);
          expect(rowFor(report, `BANK-${bank.id.slice(0, 8).toUpperCase()}`)?.balance).toBe(expected);
        }
        expect(rowFor(report, '1110')?.balance ?? '0.00').toBe('0.00');
        expect(rowFor(report, '1200')?.balance).toBe('230.00');
        expect(rowFor(report, '2100')?.balance).toBe('276.00');
        expect(report.trialBalance.balanced).toBe(true);
        const statement = await requestJson(app, `/api/bank-transactions?bankAccountId=${operating.id}&pageSize=100`, { headers: business.headers }, 200);
        expect(statement.transactions.every((row: Json) => row.isReconciled)).toBe(true);
        await writeEvidence('bank-statement-reconciled-company.json', { report, bankAccounts: banks, statement });
      } finally { await sql.end(); }
    });
  });
  it('does not add declared bank opening twice when prior capital is already in its ledger', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const business = await setUpOrganisation(app, 'Prior bank funding');
        const post = (path: string, body: Json, status = 201) => requestJson(app, path, { method: 'POST', headers: business.headers, body: JSON.stringify(body) }, status);
        const bank = await post('/api/bank-accounts', { accountName: 'Existing bank', accountNumber: '12-0003', bankName: 'Test Bank', accountType: 'checking', openingBalance: '5000.00' });
        const capital = await post('/api/accounts', { name: 'Owner capital', type: 'equity', accountClass: 'equity', accountNumber: '3000' });
        const imported = await post('/api/bank-transactions/import', { bankAccountId: bank.id, transactions: [{ transactionDate: '2026-03-20', amount: '5000.00', type: 'credit', description: 'Prior owner capital' }] });
        await post(`/api/bank-transactions/${imported.transactions[0].id}/accept`, { splits: [{ accountId: capital.id, amount: '5000.00' }] });
        const session = await post('/api/reconciliation-sessions', { bankAccountId: bank.id, statementStartDate: '2026-04-01', statementEndDate: '2026-04-30', statementOpeningBalance: '5000.00', statementClosingBalance: '5000.00' });
        expect(session.bookOpeningBalance).toBe('5000.00');
        expect(await post(`/api/reconciliation-sessions/${session.id}/complete`, {}, 200)).toMatchObject({ bookClosingBalance: '5000.00', difference: '0.00' });
        const untouchedBank = await post('/api/bank-accounts', { accountName: 'Unposted opening only', accountNumber: '12-0004', bankName: 'Test Bank', accountType: 'checking', openingBalance: '300.00' });
        const openingOnly = await post('/api/reconciliation-sessions', { bankAccountId: untouchedBank.id, statementStartDate: '2026-04-01', statementEndDate: '2026-04-30', statementOpeningBalance: '300.00', statementClosingBalance: '300.00' });
        expect(await post(`/api/reconciliation-sessions/${openingOnly.id}/complete`, {}, 200)).toMatchObject({ bookClosingBalance: '300.00', difference: '0.00' });
      } finally { await sql.end(); }
    });
  });
});
