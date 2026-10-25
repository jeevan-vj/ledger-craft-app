/**
 * NZ GST / IRD scenario evidence.
 *
 * This suite deliberately uses only the public in-process HTTP API for business
 * actions and report reads. Evidence is written to `.gst-evidence/` so the
 * before/after behaviour can be compared without committing generated data.
 *
 * Credit notes are not a Hono accounting document in the current contracts or
 * API. The legacy web GST preparation form has a manual credit-note adjustment,
 * so no credit-note posting scenario is asserted here.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
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
// API Vitest runs with `<worktree>/api` as cwd; evidence belongs at worktree root.
const evidenceDirectory = join(process.cwd(), '..', '.gst-evidence');

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
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
  // New explicit IRD names are intentionally asserted before their contract exists.
  expect.soft(report.taxSummary.outputGst).toBe(output);
  expect.soft(report.taxSummary.inputGst).toBe(input);
  expect.soft(report.taxSummary.netGst).toBe(net);
  expect.soft(report.taxSummary.position).toBe(position);
}

describe('NZ GST journals and IRD reporting scenario', () => {
  afterEach(() => vi.useRealTimers());

  it.skip('posts credit-note GST adjustments (no Hono credit-note accounting document exists yet)', () => {
    // Enable this scenario when credit notes have a server-side document,
    // posting route, and reversal semantics rather than only a manual web field.
  });

  it('posts exact 15% NZD journals and derives the selected-period GST position from the ledger', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const core = await setUpOrganisation(app, 'GST Core Scenario');

        // A: net 200 + GST 30 = 230, then settle receivables into bank.
        const invoice = await createPostedInvoice(app, core.headers, core.customerId, {
          date: '2026-04-10', amount: '200.00', description: 'Taxable consulting',
        });
        expect(invoice).toMatchObject({ subtotal: '200.00', taxAmount: '30.00', total: '230.00', status: 'sent' });
        const beforePayment = await financialReport(app, core.cookie);
        expect(rowFor(beforePayment, '1200')).toMatchObject({ debit: '230.00', credit: '0.00', balance: '230.00' });

        const payment = await requestJson(app, '/api/payments', {
          method: 'POST',
          headers: { ...core.headers, 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            invoiceId: invoice.id,
            paymentMethod: 'bank_transfer',
            amount: '230.00',
            paymentDate: '2026-04-15',
            referenceNumber: 'GST-SALE-001',
          }),
        }, 201);

        // B: inclusive bill 115 -> 100 + GST 15, then settle payables from bank.
        const bankAccount = await requestJson(app, '/api/bank-accounts', {
          method: 'POST',
          headers: core.headers,
          body: JSON.stringify({
            accountName: 'IRD scenario bank',
            accountNumber: '12-3456-7890123-00',
            bankName: 'Scenario Bank',
            accountType: 'checking',
          }),
        }, 201);
        const bill = await createReceivedBill(app, core.headers, {
          vendorId: core.vendorId,
          accountId: core.expenseAccountId,
          date: '2026-04-20',
          gross: '115.00',
          description: 'Taxable supplies',
        });
        expect(bill).toMatchObject({ subtotal: '100.00', taxAmount: '15.00', total: '115.00', lifecycleStatus: 'received' });
        const billPayment = await requestJson(app, `/api/bills/${bill.id}/payments`, {
          method: 'POST',
          headers: core.headers,
          body: JSON.stringify({
            bankAccountId: bankAccount.id,
            amount: '115.00',
            paymentDate: '2026-04-25',
            referenceNumber: 'GST-BILL-001',
          }),
        }, 201);

        const ledger = await generalLedger(app, core.cookie);
        const journals = await requestJson(app, '/api/journal-entries', { headers: { Cookie: core.cookie } }, 200);
        await writeEvidence('core-journals.json', {
          apiJournalEntries: journals,
          apiGeneralLedger: ledger,
          expectedReferences: { invoiceId: invoice.id, paymentId: payment.id, billId: bill.id, billPayment },
        });

        expect(linesFor(ledger, 'invoice', invoice.id)).toEqual(expect.arrayContaining([
          { accountNumber: '1200', debit: '230.00', credit: '0.00' },
          { accountNumber: '4000', debit: '0.00', credit: '200.00' },
          { accountNumber: '2200', debit: '0.00', credit: '30.00' },
        ]));
        expect(linesFor(ledger, 'invoice_payment', payment.id)).toEqual(expect.arrayContaining([
          { accountNumber: '1110', debit: '230.00', credit: '0.00' },
          { accountNumber: '1200', debit: '0.00', credit: '230.00' },
        ]));
        expect(linesFor(ledger, 'bill', bill.id)).toEqual(expect.arrayContaining([
          { accountNumber: '5000', debit: '100.00', credit: '0.00' },
          { accountNumber: '2150', debit: '15.00', credit: '0.00' },
          { accountNumber: '2100', debit: '0.00', credit: '115.00' },
        ]));
        expect(linesFor(ledger, 'bill_payment', billPayment.payments[0].id)).toEqual(expect.arrayContaining([
          { accountNumber: '2100', debit: '115.00', credit: '0.00' },
          { accountNumber: '1110', debit: '0.00', credit: '115.00' },
        ]));

        // C1: invoice + bill only => 30 output - 15 input = 15 payable.
        const invoiceAndBillReport = await financialReport(app, core.cookie);
        await writeEvidence('invoice-bill-financial-report.json', {
          taxSummary: invoiceAndBillReport.taxSummary,
          trialBalance: invoiceAndBillReport.trialBalance,
        });
        expectGst(invoiceAndBillReport, '30.00', '15.00', '15.00', 'payable');
        expect(invoiceAndBillReport.trialBalance.balanced).toBe(true);
        expect(decimal(invoiceAndBillReport.trialBalance.totalDebits).compare(invoiceAndBillReport.trialBalance.totalCredits)).toBe(0);
        expect(rowFor(invoiceAndBillReport, '4000')).toMatchObject({ balance: '200.00' });
        expect(rowFor(invoiceAndBillReport, '2200')).toMatchObject({ balance: '30.00' });
        expect(rowFor(invoiceAndBillReport, '1200')).toMatchObject({ balance: '0.00' });
        expect(rowFor(invoiceAndBillReport, '5000')).toMatchObject({ balance: '100.00' });
        expect(rowFor(invoiceAndBillReport, '2100')).toMatchObject({ balance: '0.00' });
        expect(rowFor(invoiceAndBillReport, '1110')).toMatchObject({ debit: '230.00', credit: '115.00', balance: '115.00' });

        // C2: a direct paid inclusive expense contributes another 15 input GST.
        const expense = await requestJson(app, '/api/expenses', {
          method: 'POST',
          headers: core.headers,
          body: JSON.stringify({
            description: 'Direct paid expense (GST inclusive)',
            amount: '115.00',
            taxAmount: '15.00',
            currency: 'NZD',
            expenseDate: '2026-05-05',
            status: 'approved',
            paymentMethod: 'bank_transfer',
            gstTreatment: 'standard',
          }),
        }, 201);
        const withExpenseLedger = await generalLedger(app, core.cookie);
        expect(linesFor(withExpenseLedger, 'expense', expense.id)).toEqual(expect.arrayContaining([
          { accountNumber: '5000', debit: '100.00', credit: '0.00' },
          { accountNumber: '2150', debit: '15.00', credit: '0.00' },
          { accountNumber: '1110', debit: '0.00', credit: '115.00' },
        ]));
        const withExpenseReport = await financialReport(app, core.cookie);
        await writeEvidence('invoice-bill-expense-financial-report.json', {
          taxSummary: withExpenseReport.taxSummary,
          trialBalance: withExpenseReport.trialBalance,
        });
        expectGst(withExpenseReport, '30.00', '30.00', '0.00', 'nil');

        // D1: zero-rated/exempt-equivalent tax rate contributes no GST.
        const zeroRated = await createPostedInvoice(app, core.headers, core.customerId, {
          date: '2026-05-10', amount: '50.00', taxRate: '0', description: 'Zero-rated export',
        });
        expect(zeroRated).toMatchObject({ subtotal: '50.00', taxAmount: '0.00', total: '50.00' });

        // D2: GST-inclusive invoice pricing splits 115 into net 100 + GST 15.
        const inclusive = await createPostedInvoice(app, core.headers, core.customerId, {
          date: '2026-05-12', amount: '115.00', taxInclusive: true, description: 'GST-inclusive sale',
        });
        expect(inclusive).toMatchObject({ subtotal: '100.00', taxAmount: '15.00', total: '115.00' });

        // D3: a document before `from` must not change selected-period GST.
        const outsidePeriod = await createPostedInvoice(app, core.headers, core.customerId, {
          date: '2026-03-31', amount: '100.00', description: 'Prior-period sale',
        });
        expect(outsidePeriod.taxAmount).toBe('15.00');
        const edgeReport = await financialReport(app, core.cookie);
        await writeEvidence('period-and-inclusive-financial-report.json', {
          taxSummary: edgeReport.taxSummary,
          trialBalance: edgeReport.trialBalance,
          documents: { zeroRated, inclusive, outsidePeriod },
        });
        expectGst(edgeReport, '45.00', '30.00', '15.00', 'payable');
        // `credit` is the selected-period movement; `balance` also includes the
        // prior-period opening amount and is therefore expected to be 60.00.
        expect(rowFor(edgeReport, '2200')).toMatchObject({ credit: '45.00' });

        // D4: cancellation reverses balances and GST; restore reinstates both.
        const lifecycle = await setUpOrganisation(app, 'GST Lifecycle Scenario');
        const lifecycleInvoice = await createPostedInvoice(app, lifecycle.headers, lifecycle.customerId, {
          date: '2026-06-01', amount: '200.00', description: 'Reversible sale',
        });
        const lifecycleBill = await createReceivedBill(app, lifecycle.headers, {
          vendorId: lifecycle.vendorId,
          accountId: lifecycle.expenseAccountId,
          date: '2026-06-02',
          gross: '115.00',
          description: 'Reversible purchase',
        });
        const lifecycleBefore = await financialReport(app, lifecycle.cookie, '2026-01-01', '2026-12-31');
        expectGst(lifecycleBefore, '30.00', '15.00', '15.00', 'payable');

        await requestJson(app, `/api/invoices/${lifecycleInvoice.id}/cancel`, {
          method: 'POST', headers: lifecycle.headers, body: JSON.stringify({ reason: 'Scenario reversal' }),
        }, 200);
        await requestJson(app, `/api/bills/${lifecycleBill.id}/cancel`, {
          method: 'POST', headers: lifecycle.headers, body: '{}',
        }, 200);
        const lifecycleCancelled = await financialReport(app, lifecycle.cookie, '2026-01-01', '2026-12-31');
        await writeEvidence('lifecycle-cancelled-financial-report.json', {
          taxSummary: lifecycleCancelled.taxSummary,
          trialBalance: lifecycleCancelled.trialBalance,
          generalLedger: await generalLedger(app, lifecycle.cookie, '2026-01-01', '2026-12-31'),
        });
        expectGst(lifecycleCancelled, '0.00', '0.00', '0.00', 'nil');
        for (const accountNumber of ['1200', '4000', '2200', '5000', '2150', '2100']) {
          expect.soft(roundMoney(rowFor(lifecycleCancelled, accountNumber)?.balance ?? '0')).toBe('0.00');
        }

        await requestJson(app, `/api/invoices/${lifecycleInvoice.id}/restore`, {
          method: 'POST', headers: lifecycle.headers, body: '{}',
        }, 200);
        await requestJson(app, `/api/bills/${lifecycleBill.id}/restore`, {
          method: 'POST', headers: lifecycle.headers, body: '{}',
        }, 200);
        const lifecycleRestored = await financialReport(app, lifecycle.cookie, '2026-01-01', '2026-12-31');
        await writeEvidence('lifecycle-restored-financial-report.json', {
          taxSummary: lifecycleRestored.taxSummary,
          trialBalance: lifecycleRestored.trialBalance,
          generalLedger: await generalLedger(app, lifecycle.cookie, '2026-01-01', '2026-12-31'),
        });
        expectGst(lifecycleRestored, '30.00', '15.00', '15.00', 'payable');
        for (const [accountNumber, balance] of Object.entries({
          '1200': '230.00', '4000': '200.00', '2200': '30.00',
          '5000': '100.00', '2150': '15.00', '2100': '115.00',
        })) {
          expect.soft(rowFor(lifecycleRestored, accountNumber)?.balance).toBe(balance);
        }
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
  it('keeps an active invoice in the ledger across repeated and concurrent cancel/restore cycles', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const org = await setUpOrganisation(app, 'GST Restore Cycle');
        const invoice = await createPostedInvoice(app, org.headers, org.customerId, {
          date: '2026-06-01', amount: '200.00', description: 'Cycled sale',
        });
        await createReceivedBill(app, org.headers, {
          vendorId: org.vendorId, accountId: org.expenseAccountId, date: '2026-06-02', gross: '115.00', description: 'Cycle purchase',
        });
        const action = (verb: 'cancel' | 'restore') => app.request(`/api/invoices/${invoice.id}/${verb}`, {
          method: 'POST', headers: org.headers, body: '{}',
        });
        const wide = () => financialReport(app, org.cookie, '2000-01-01', '2099-12-31');
        const expectActive = async (label: string) => {
          const report = await wide();
          expect(report.taxSummary.outputGst, label).toBe('30.00');
          expect(report.taxSummary.inputGst, label).toBe('15.00');
          expect(report.taxSummary.netGst, label).toBe('15.00');
          expect(report.taxSummary.position, label).toBe('payable');
          expect(report.trialBalance.balanced, label).toBe(true);
          expect(rowFor(report, '1200')?.balance, label).toBe('230.00');
          expect(rowFor(report, '4000')?.balance, label).toBe('200.00');
          expect(rowFor(report, '2200')?.balance, label).toBe('30.00');
        };

        for (let cycle = 1; cycle <= 3; cycle += 1) {
          expect((await action('cancel')).status).toBe(200);
          const cancelled = await wide();
          expect(cancelled.taxSummary.outputGst, `cancel ${cycle}`).toBe('0.00');
          expect(cancelled.taxSummary.position, `cancel ${cycle}`).toBe('refundable');
          expect((await action('restore')).status).toBe(200);
          // A second restore of an already-active invoice must not post again.
          expect((await action('restore')).status).toBe(200);
          await expectActive(`after cycle ${cycle}`);
        }

        expect((await action('cancel')).status).toBe(200);
        const concurrent = await Promise.all([action('restore'), action('restore'), action('restore')]);
        expect(concurrent.map((response) => response.status)).toEqual([200, 200, 200]);
        await expectActive('after concurrent restores');

        const ledger = await generalLedger(app, org.cookie, '2000-01-01', '2099-12-31');
        const entries = (type: string) => new Set((ledger.lines as Json[])
          .filter((line) => line.referenceType === type && line.referenceId === invoice.id)
          .map((line) => line.journalEntryId)).size;
        expect(entries('invoice_cancellation')).toBe(4);
        expect(entries('invoice_restore')).toBe(4);
        const numbers = (ledger.lines as Json[]).map((line) => `${line.journalEntryId}:${line.entryNumber}`);
        const uniqueNumbers = new Set(numbers.map((value) => value.split(':')[1]));
        expect(uniqueNumbers.size).toBe(new Set(numbers.map((value) => value.split(':')[0])).size);
        await writeEvidence('restore-cycle-financial-report.json', { taxSummary: (await wide()).taxSummary, generalLedger: ledger });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('excludes foreign-currency documents from the NZD GST return and flags them', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const org = await setUpOrganisation(app, 'Foreign Currency GST');
        await createPostedInvoice(app, org.headers, org.customerId, { date: '2026-05-01', amount: '200.00', description: 'NZD sale' });
        await requestJson(app, '/api/exchange-rates', {
          method: 'POST',
          headers: org.headers,
          body: JSON.stringify({ currencyCode: 'USD', effectiveDate: '2026-04-01', rate: '1.60000' }),
        }, 201);
        await createPostedInvoice(app, org.headers, org.customerId, { date: '2026-05-02', amount: '100.00', currency: 'USD', description: 'USD sale' });
        const report = await financialReport(app, org.cookie);
        expectGst(report, '30.00', '0.00', '30.00', 'payable');
        expect(report.taxSummary.foreignCurrencyDocumentsExcluded).toBe(1);
        expect(report.taxSummary.warnings).toHaveLength(1);
        expect(report.taxSummary.warnings[0]).toMatch(/foreign-currency/);
        await writeEvidence('foreign-currency-financial-report.json', { taxSummary: report.taxSummary });
      } finally {
        await sql.end();
      }
    });
  });

  it('reports GST on the invoice basis for cash-basis and account-filtered reports', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const org = await setUpOrganisation(app, 'GST Basis Label');
        await createPostedInvoice(app, org.headers, org.customerId, { date: '2026-05-01', amount: '200.00', description: 'Unpaid sale' });
        const accrual = await financialReport(app, org.cookie);
        expectGst(accrual, '30.00', '0.00', '30.00', 'payable');
        expect(accrual.taxSummary.basis).toBe('invoice');

        const cash = await requestJson(app, '/api/reports/financial?from=2026-04-01&to=2026-06-30&basis=cash&baseCurrency=NZD', { headers: { Cookie: org.cookie } }, 200);
        expectGst(cash, '30.00', '0.00', '30.00', 'payable');
        expect(cash.taxSummary.basis).toBe('invoice');

        const salesAccount = rowFor(accrual, '4000');
        expect(salesAccount).toBeDefined();
        const filtered = await requestJson(app, `/api/reports/financial?from=2026-04-01&to=2026-06-30&basis=accrual&baseCurrency=NZD&accountIds=${salesAccount!.accountId}`, { headers: { Cookie: org.cookie } }, 200);
        expect(filtered.trialBalance.rows.map((row: Json) => row.accountNumber)).toEqual(['4000']);
        expectGst(filtered, '30.00', '0.00', '30.00', 'payable');
        await writeEvidence('basis-and-account-filter-financial-report.json', { cash: cash.taxSummary, filtered: filtered.taxSummary });
      } finally {
        await sql.end();
      }
    });
  });

  it('dates cancel/void journals in NZ time so a 00:30 NZST 1 July cancellation lands in the next GST quarter', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const org = await setUpOrganisation(app, 'GST Timezone Cutover');
        const invoice = await createPostedInvoice(app, org.headers, org.customerId, { date: '2026-06-01', amount: '200.00', description: 'June sale' });
        const bill = await createReceivedBill(app, org.headers, {
          vendorId: org.vendorId, accountId: org.expenseAccountId, date: '2026-06-02', gross: '115.00', description: 'June purchase',
        });

        // 2026-06-30T12:30Z is still 30 June in UTC but 00:30 on 1 July in Auckland.
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-30T12:30:00.000Z') });
        await requestJson(app, `/api/invoices/${invoice.id}/cancel`, { method: 'POST', headers: org.headers, body: '{}' }, 200);
        await requestJson(app, `/api/bills/${bill.id}/cancel`, { method: 'POST', headers: org.headers, body: '{}' }, 200);
        vi.useRealTimers();

        const ledger = await generalLedger(app, org.cookie, '2026-01-01', '2026-12-31');
        const reversalDates = (ledger.lines as Json[])
          .filter((line) => line.referenceType === 'invoice_cancellation' || line.referenceType === 'bill_void')
          .map((line) => line.date);
        expect(reversalDates.length).toBeGreaterThan(0);
        expect(new Set(reversalDates)).toEqual(new Set(['2026-07-01']));

        // June quarter keeps the original GST; the cancellation is a September-quarter adjustment.
        const juneQuarter = await financialReport(app, org.cookie, '2026-04-01', '2026-06-30');
        expectGst(juneQuarter, '30.00', '15.00', '15.00', 'payable');
        const septemberQuarter = await financialReport(app, org.cookie, '2026-07-01', '2026-09-30');
        expectGst(septemberQuarter, '-30.00', '-15.00', '-15.00', 'refundable');
        await writeEvidence('timezone-cutover-financial-report.json', { juneQuarter: juneQuarter.taxSummary, septemberQuarter: septemberQuarter.taxSummary });
      } finally {
        await sql.end();
      }
    });
  });
});
