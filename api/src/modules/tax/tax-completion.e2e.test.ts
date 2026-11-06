import { gstPreparationResponseSchema, companyIncomeTaxPreparationResponseSchema, taxReturnSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

type App = ReturnType<typeof createApp>;
const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
async function scenario(run: (app: App, headers: Record<string, string>) => Promise<void>) {
  await withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
      const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'Tax completion', email: `tax-${crypto.randomUUID()}@example.test`, password: 'Local-tax-2026-123!' }) });
      expect(signup.status).toBe(200);
      const headers = { ...origin, Cookie: signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
      await json(app, headers, '/api/business-profile', { name: 'Tax Reference Limited', email: 'owner@reference.example.test', country: 'NZ', defaultTaxRate: '15' }, 200, 'PUT');
      await json(app, headers, '/api/tax/gst-settings', gstSettings('invoice'), 200, 'PUT');
      await run(app, headers);
    } finally { await sql.end(); }
  });
}
async function json(app: App, headers: Record<string, string>, path: string, body?: unknown, status = 201, method = 'POST') {
  const response = await app.request(path, { headers, method: body === undefined ? 'GET' : method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json() as Record<string, unknown>;
  expect(response.status, JSON.stringify(value)).toBe(status);
  return value;
}
async function reference(app: App, headers: Record<string, string>) {
  const customer = await json(app, headers, '/api/customers', { name: 'Harbour Cafe', email: 'accounts@harbour.example.test' });
  const expenseAccount = await json(app, headers, '/api/accounts', { name: 'Operating costs', type: 'expense', accountClass: 'expense', accountNumber: '5000' });
  const bank = await json(app, headers, '/api/bank-accounts', { accountName: 'Operating', accountNumber: '123', bankName: 'Test Bank', accountType: 'checking' });
  const invoices = [];
  for (const [amount, receipt] of [['1000', '1150'], ['400', '230']]) {
    const invoice = await json(app, headers, '/api/invoices', { customerId: customer.id, date: '2026-04-05', dueDate: '2026-04-30', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'Consulting', quantity: '1', rate: amount }] });
    await json(app, headers, '/api/payments', { invoiceId: invoice.id, amount: receipt, paymentDate: '2026-04-10', paymentMethod: 'bank_transfer' });
    invoices.push(invoice);
  }
  for (const [amount, taxAmount, gstTreatment] of [['230', '30', 'standard'], ['50', '0', 'exempt']]) await json(app, headers, '/api/expenses', { description: 'Business cost', amount, taxAmount, gstTreatment, expenseDate: '2026-04-12', currency: 'NZD', status: 'approved' });
  const vendor = await json(app, headers, '/api/vendors', { name: 'Subcontractor' });
  const bill = await json(app, headers, '/api/bills', { vendorId: vendor.id, issueDate: '2026-04-15', dueDate: '2026-04-30', taxInclusive: true, currency: 'NZD', lines: [{ description: 'Work', quantity: '1', unitPrice: '345', taxRate: '15', accountId: expenseAccount.id }] });
  await json(app, headers, `/api/bills/${bill.id}/receive`, {}, 200);
  await json(app, headers, `/api/bills/${bill.id}/payments`, { bankAccountId: bank.id, amount: '69', paymentDate: '2026-04-20' });
  return invoices;
}
const period = { from: '2026-04-01', to: '2026-04-30' };
const gstSettings = (basis: 'invoice' | 'payments' | 'hybrid') => ({ gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: basis, gstFilingFrequency: 'monthly', gstPeriodAnchor: 3 });

describe('completed company tax preparation', () => {
  it('prepares independently expected invoice GST135 and payments GST141, preserving period and company isolation', async () => {
    await scenario(async (app, headers) => {
      await reference(app, headers);
      const invoice = await json(app, headers, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30', undefined, 200);
      expect(invoice).toMatchObject({ basis: 'invoice', totalSales: '1610.00', totalPurchases: '625.00', gstOnSales: '210.00', gstOnPurchases: '75.00', netGstPosition: '135.00' });
      await json(app, headers, '/api/tax/gst-settings', gstSettings('payments'), 200, 'PUT');
      const cash = await json(app, headers, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30&basis=payments', undefined, 200);
      expect(cash).toMatchObject({ basis: 'payments', totalSales: '1380.00', totalPurchases: '349.00', gstOnSales: '180.00', gstOnPurchases: '39.00', netGstPosition: '141.00' });
      const empty = await json(app, headers, '/api/tax/gst-preparation?from=2026-05-01&to=2026-05-31&basis=payments', undefined, 200);
      expect(empty).toMatchObject({ totalSales: '0.00', totalPurchases: '0.00', netGstPosition: '0.00' });
      const other = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'Other company', email: `other-${crypto.randomUUID()}@example.test`, password: 'Local-other-tax-123!' }) });
      const otherHeaders = { ...origin, Cookie: other.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
      const isolated = await json(app, otherHeaders, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30&basis=payments', undefined, 200);
      expect(isolated).toMatchObject({ totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGstPosition: '0.00' });
      expect((await app.request('/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30&basis=payments')).status).toBe(401);

    });
  });
  it('uses valid foreign-document NZD snapshots once and requires explicit review of document-rate payments GST', async () => {
    await scenario(async (app, headers) => {
      const post = (path: string, body: unknown, status = 201, method = 'POST') => json(app, headers, path, body, status, method);
      await post('/api/exchange-rates', { currencyCode: 'USD', effectiveDate: '2026-04-01', rate: '1.60000' });
      const customer = await post('/api/customers', { name: 'Foreign customer', email: 'foreign@example.test' });
      const expenseAccount = await post('/api/accounts', { name: 'Foreign operating costs', type: 'expense', accountClass: 'expense', accountNumber: '5000' });
      const bank = await post('/api/bank-accounts', { accountName: 'Operating', accountNumber: '123', bankName: 'Test Bank', accountType: 'checking' });
      const invoice = await post('/api/invoices', { customerId: customer.id, date: '2026-04-05', dueDate: '2026-04-30', currency: 'USD', taxInclusive: false, taxRate: '15', items: [{ description: 'USD work', quantity: '1', rate: '100' }] });
      await post(`/api/invoices/${invoice.id}`, { status: 'sent' }, 200, 'PATCH');
      await post('/api/expenses', { description: 'USD approved cost', amount: '115', taxAmount: '15', currency: 'USD', expenseDate: '2026-04-05', status: 'approved' });
      const vendor = await post('/api/vendors', { name: 'Foreign subcontractor' });
      const bill = await post('/api/bills', { vendorId: vendor.id, issueDate: '2026-04-05', dueDate: '2026-04-30', currency: 'USD', taxInclusive: true, lines: [{ description: 'USD work', quantity: '1', unitPrice: '345', taxRate: '15', accountId: expenseAccount.id }] });
      await post(`/api/bills/${bill.id}/receive`, {}, 200);
      await post('/api/exchange-rates', { currencyCode: 'USD', effectiveDate: '2026-04-20', rate: '1.70000' });
      await post('/api/payments', { invoiceId: invoice.id, amount: '57.50', paymentDate: '2026-04-20', paymentMethod: 'bank_transfer' });
      await post(`/api/bills/${bill.id}/payments`, { bankAccountId: bank.id, amount: '69.00', paymentDate: '2026-04-20' });
      const invoiceBasis = await json(app, headers, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30', undefined, 200);
      expect(invoiceBasis).toMatchObject({ totalSales: '184.00', totalPurchases: '736.00', gstOnSales: '24.00', gstOnPurchases: '96.00', netGstPosition: '-72.00' });
      await json(app, headers, '/api/tax/gst-settings', gstSettings('payments'), 200, 'PUT');
      const paymentBasis = gstPreparationResponseSchema.parse(await json(app, headers, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30&basis=payments', undefined, 200));
      expect(paymentBasis).toMatchObject({ totalSales: '92.00', totalPurchases: '294.40', gstOnSales: '12.00', gstOnPurchases: '38.40', netGstPosition: '-26.40', requiresReview: true });
      expect(paymentBasis.warnings.join(' ')).toMatch(/document.*rate|carrying/i);
      const reviewed = await post('/api/tax/gst-preparation', { ...period, basis: 'payments', reviewConfirmed: true, adjustments: [] }, 200);
      expect(reviewed).toMatchObject({ netGstPosition: '-26.40', review: { confirmed: true } });
    });
  });
  it('records reviewed GST adjustments with reasons/source references and reloads the exact audit snapshot', async () => {
    await scenario(async (app, headers) => {
      await reference(app, headers);
      const adjustments = [{ kind: 'output', amount: '-15.00', grossAdjustment: '-115.00', reason: 'Credit note issued for services returned', sourceReference: 'CN-001' }, { kind: 'input', amount: '3.00', reason: 'Supported purchase GST adjustment', sourceReference: 'GST-ADJ-002' }];
      const preparation = gstPreparationResponseSchema.parse(await json(app, headers, '/api/tax/gst-preparation', { ...period, basis: 'invoice', reviewConfirmed: true, adjustments }, 200));
      expect(preparation).toMatchObject({ totalSales: '1495.00', gstOnSales: '195.00', gstOnPurchases: '78.00', netGstPosition: '117.00', review: { confirmed: true, adjustments, unadjustedGstOnSales: '210.00', unadjustedGstOnPurchases: '75.00' } });
      expect(preparation.review?.reviewedBy).toBeTruthy();
      const draft = await json(app, headers, '/api/tax-returns', { periodStart: period.from, periodEnd: period.to, returnType: 'GST', totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases, gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition, returnData: { preparation: { basis: 'invoice', baseCurrency: 'NZD', dueDate: '2026-05-28' }, gstReview: preparation.review } });
      expect(taxReturnSchema.parse(await json(app, headers, `/api/tax-returns/${draft.id}`, undefined, 200)).returnData?.gstReview).toMatchObject({ ...preparation.review, reviewedAt: expect.any(String) });
      const invalid = await app.request('/api/tax/gst-preparation', { method: 'POST', headers, body: JSON.stringify({ ...period, reviewConfirmed: false, adjustments }) });
      expect(invalid.status).toBe(400);
    });
  });
  it('replays optional keyed draft creation once and rejects a changed body for the same key', async () => {
    await scenario(async (app, headers) => {
      const keyed = { ...headers, 'Idempotency-Key': crypto.randomUUID() };
      const input = { periodStart: period.from, periodEnd: period.to, returnType: 'GST', totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00' };
      const first = await json(app, keyed, '/api/tax-returns', input);
      const retry = await json(app, keyed, '/api/tax-returns', input);
      expect(retry.id).toBe(first.id);
      expect((await json(app, headers, '/api/tax-returns', undefined, 200)).taxReturns).toHaveLength(1);
      await json(app, keyed, '/api/tax-returns', { ...input, totalSales: '115.00' }, 409);
    });
  });
  it('binds saved preparation review attribution to the authenticated author, not a client-supplied reviewer', async () => {
    await scenario(async (app, headers) => {
      const preparation = gstPreparationResponseSchema.parse(await json(app, headers, '/api/tax/gst-preparation', { ...period, reviewConfirmed: true, adjustments: [] }, 200));
      const draft = taxReturnSchema.parse(await json(app, headers, '/api/tax-returns', { periodStart: period.from, periodEnd: period.to, totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00', returnData: { gstReview: { ...preparation.review, reviewedBy: 'forged-reviewer', reviewedAt: '2000-01-01T00:00:00.000Z' } } }));
      expect(draft.returnData?.gstReview?.reviewedBy).toBe(preparation.review?.reviewedBy);
      expect(draft.returnData?.gstReview?.reviewedAt).not.toBe('2000-01-01T00:00:00.000Z');
    });
  });
  it('prepares company tax from posted profit850 plus addbacks100 minus deductions50/losses200 at confirmed28% less credits50 =146', async () => {
    await scenario(async (app, headers) => {
      await reference(app, headers);
      const input = { ...period, entityType: 'nz_company', taxRate: '28', rateConfirmed: true, adjustments: [{ kind: 'add_back', amount: '100.00', reason: 'Non deductible entertainment adjustment', sourceReference: 'TAX-01' }, { kind: 'deduction', amount: '50.00', reason: 'Additional allowable tax deduction', sourceReference: 'TAX-02' }], lossesBroughtForward: '200.00', taxCredits: '50.00' };
      const value = companyIncomeTaxPreparationResponseSchema.parse(await json(app, headers, '/api/tax/company-income-tax-preparation', input, 200));
      expect(value).toMatchObject({ accountingProfit: '850.00', addBacks: '100.00', deductions: '50.00', taxAdjustedProfit: '900.00', lossesApplied: '200.00', taxableIncome: '700.00', incomeTax: '196.00', incomeTaxPayable: '146.00', excessCredits: '0.00', lossesCarriedForward: '0.00' });
      expect(value.warnings.join(' ')).toMatch(/IR4|filing/);
      const loss = await json(app, headers, '/api/tax/company-income-tax-preparation', { ...input, lossesBroughtForward: '1000.00' }, 200);
      expect(loss).toMatchObject({ taxableIncome: '0.00', lossesApplied: '900.00', lossesCarriedForward: '100.00', incomeTaxPayable: '0.00', excessCredits: '50.00' });
      const negative = await json(app, headers, '/api/tax/company-income-tax-preparation', { ...input, adjustments: [{ kind: 'deduction', amount: '1100.00', reason: 'Confirmed additional tax deduction', sourceReference: 'TAX-03' }] }, 200);
      expect(negative).toMatchObject({ taxAdjustedProfit: '-250.00', lossesApplied: '0.00', lossesCarriedForward: '450.00', taxableIncome: '0.00', incomeTax: '0.00', incomeTaxPayable: '0.00' });
      const saved = taxReturnSchema.parse(await json(app, headers, '/api/tax-returns', { periodStart: period.from, periodEnd: period.to, returnType: 'Income_Tax', totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: value.incomeTaxPayable, returnData: { companyIncomeTax: value } }));
      const reloaded = taxReturnSchema.parse(await json(app, headers, `/api/tax-returns/${saved.id}`, undefined, 200));
      expect(reloaded.returnData?.companyIncomeTax).toMatchObject({ accountingProfit: '850.00', taxableIncome: '700.00', incomeTaxPayable: '146.00', adjustments: input.adjustments, preparedBy: value.preparedBy });

      const unconfirmed = await app.request('/api/tax/company-income-tax-preparation', { method: 'POST', headers, body: JSON.stringify({ ...input, rateConfirmed: false }) });
      expect(unconfirmed.status).toBe(400);
    });
  });
});
