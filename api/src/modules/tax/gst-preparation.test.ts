import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

type TestApp = ReturnType<typeof createApp>;
// Loose JSON shape for reading nested API responses in this scenario test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const jsonHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};
function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
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

describe('GST preparation source selection', () => {
  it('preserves deleted-expense history and the already-converted foreign expense and its dated reversal', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const business = await setUpOrganisation(app, 'GST expense history');
        const post = (path: string, body: Json) => requestJson(app, path, { method: 'POST', headers: business.headers, body: JSON.stringify(body) }, 201);
        await post('/api/exchange-rates', { currencyCode: 'USD', effectiveDate: '2026-04-01', rate: '1.60000' });
        const local = await post('/api/expenses', { description: 'NZD paid expense', amount: '230.00', taxAmount: '30.00', expenseDate: '2026-04-05', status: 'approved', currency: 'NZD' });
        const foreign = await post('/api/expenses', { description: 'USD paid expense', amount: '115.00', taxAmount: '15.00', expenseDate: '2026-04-05', status: 'approved', currency: 'USD' });
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-05-15T00:00:00Z') });
        for (const expense of [local, foreign]) expect((await app.request(`/api/expenses/${expense.id}`, { method: 'DELETE', headers: business.headers })).status).toBe(204);
        const read = (from: string, to: string) => requestJson(app, `/api/tax/gst-preparation?from=${from}&to=${to}`, { headers: business.headers }, 200);
        expect(await read('2026-04-01', '2026-04-30')).toMatchObject({ totalPurchases: '414.00', gstOnPurchases: '54.00' });
        expect(await read('2026-05-01', '2026-05-31')).toMatchObject({ totalPurchases: '-414.00', gstOnPurchases: '-54.00' });
      } finally { vi.useRealTimers(); await sql.end(); }
    });
  });
  it('keeps original-period gross and GST after later cancellation and reports dated reversal and restoration movements', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const business = await setUpOrganisation(app, 'GST immutable history');
        const invoice = await createPostedInvoice(app, business.headers, business.customerId, { date: '2026-04-05', amount: '1000.00', description: 'April consulting' });
        const bill = await createReceivedBill(app, business.headers, { vendorId: business.vendorId, accountId: business.expenseAccountId, date: '2026-04-05', gross: '345.00', description: 'April subcontractor' });
        const action = (path: string) => requestJson(app, path, { method: 'POST', headers: business.headers, body: '{}' }, 200);
        const preparation = (from: string, to: string) => requestJson(app, `/api/tax/gst-preparation?from=${from}&to=${to}`, { headers: business.headers }, 200);
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-05-15T00:00:00Z') });
        await action(`/api/invoices/${invoice.id}/cancel`);
        await action(`/api/bills/${bill.id}/cancel`);
        expect(await preparation('2026-04-01', '2026-04-30')).toMatchObject({ totalSales: '1150.00', totalPurchases: '345.00', gstOnSales: '150.00', gstOnPurchases: '45.00', netGstPosition: '105.00' });
        expect(await preparation('2026-05-01', '2026-05-31')).toMatchObject({ totalSales: '-1150.00', totalPurchases: '-345.00', gstOnSales: '-150.00', gstOnPurchases: '-45.00', netGstPosition: '-105.00', requiresReview: true });
        vi.setSystemTime(new Date('2026-06-15T00:00:00Z'));
        await action(`/api/invoices/${invoice.id}/restore`);
        await action(`/api/bills/${bill.id}/restore`);
        expect(await preparation('2026-06-01', '2026-06-30')).toMatchObject({ totalSales: '1150.00', totalPurchases: '345.00', gstOnSales: '150.00', gstOnPurchases: '45.00', netGstPosition: '105.00' });
        expect(await preparation('2026-04-01', '2026-06-30')).toMatchObject({ totalSales: '1150.00', totalPurchases: '345.00', gstOnSales: '150.00', gstOnPurchases: '45.00', netGstPosition: '105.00' });
      } finally { vi.useRealTimers(); await sql.end(); }
    });
  });
  it('requires authentication and a valid ordered period', async () => {
    expect((await createApp().request('/api/tax/gst-preparation?from=2026-05-01&to=2026-05-31')).status).toBe(401);
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const cookie = await signUp(app, 'GST validation');
        for (const query of ['from=2026-06-01&to=2026-05-01', 'from=2026-02-30&to=2026-05-01', 'from=2026-05-01', 'from=2026-05-01&to=2026-05-31&organisationId=other']) {
          expect((await app.request(`/api/tax/gst-preparation?${query}`, { headers: { Cookie: cookie } })).status).toBe(400);
        }
      } finally { await sql.end(); }
    });
  });

  it('excludes drafts, cancelled, unapproved and out-of-period documents while including reviewed foreign base snapshots without leaking another company', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const business = await setUpOrganisation(app, 'GST source selection');
        const post = (path: string, body: Json, status = 201) => requestJson(app, path, { method: 'POST', headers: business.headers, body: JSON.stringify(body) }, status);
        await createPostedInvoice(app, business.headers, business.customerId, { date: '2026-05-01', amount: '100', description: 'Eligible sale' });
        await createPostedInvoice(app, business.headers, business.customerId, { date: '2026-04-30', amount: '100', description: 'Prior period sale' });
        await post('/api/invoices', { customerId: business.customerId, date: '2026-05-01', dueDate: '2026-05-31', taxInclusive: false, taxRate: '15', items: [{ description: 'Draft', quantity: '1', rate: '100' }] });
        const cancelled = await createPostedInvoice(app, business.headers, business.customerId, { date: '2026-05-02', amount: '100', description: 'Cancelled sale' });
        const cancelledBill = await createReceivedBill(app, business.headers, { vendorId: business.vendorId, accountId: business.expenseAccountId, date: '2026-05-02', gross: '115', description: 'Cancelled bill' });
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-05-15T00:00:00Z') });
        await post(`/api/invoices/${cancelled.id}/cancel`, {}, 200);
        await post(`/api/bills/${cancelledBill.id}/cancel`, {}, 200);
        vi.useRealTimers();
        await post('/api/bills', { vendorId: business.vendorId, issueDate: '2026-05-03', dueDate: '2026-05-31', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Draft bill', quantity: '1', unitPrice: '115', taxRate: '15', accountId: business.expenseAccountId }] });
        for (const status of ['approved', 'pending', 'rejected']) await post('/api/expenses', { description: `${status} expense`, amount: '115', taxAmount: '15', expenseDate: '2026-05-05', status, currency: 'NZD' });
        await post('/api/expenses', { description: 'Outside expense', amount: '115', taxAmount: '15', expenseDate: '2026-04-30', status: 'approved', currency: 'NZD' });
        await post('/api/exchange-rates', { currencyCode: 'USD', effectiveDate: '2026-04-01', rate: '1.60000' });
        await createPostedInvoice(app, business.headers, business.customerId, { date: '2026-05-04', amount: '100', currency: 'USD', description: 'Foreign sale' });
        const result = await requestJson(app, '/api/tax/gst-preparation?from=2026-05-01&to=2026-05-31', { headers: business.headers }, 200);
        expect(result).toMatchObject({ basis: 'invoice', totalSales: '299.00', totalPurchases: '115.00', gstOnSales: '39.00', gstOnPurchases: '15.00', netGstPosition: '24.00' });
        expect(result.warnings.join(' ')).toMatch(/reversal movements/);
        const other = await setUpOrganisation(app, 'GST separate business');
        const isolated = await requestJson(app, '/api/tax/gst-preparation?from=2026-05-01&to=2026-05-31', { headers: other.headers }, 200);
        expect(isolated).toMatchObject({ totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGstPosition: '0.00', warnings: [] });
      } finally { vi.useRealTimers(); await sql.end(); }
    });
  });
});
