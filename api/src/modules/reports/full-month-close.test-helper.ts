import { expect } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';

/** Real HTTP commands for a disposable, synthetic company; no direct row seeding. */
export async function fullMonthCloseFixture() {
  const { db, sql } = createDb(getDatabaseUrl());
  const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
  const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'Month close owner', email: `full-close-${crypto.randomUUID()}@example.test`, password: 'Local-MonthClose-2026!' }) });
  expect(signup.status).toBe(200);
  const headers = { ...origin, Cookie: signup.headers.getSetCookie().map(row => row.split(';')[0]).join('; ') };
  const commands: Array<{ method: string; path: string; status: number }> = [];
  async function request<T = { id: string }>(path: string, method = 'GET', body?: unknown, status = 200): Promise<T> {
    const response = await app.request(path, { method, headers: { ...headers, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    commands.push({ method, path, status: response.status });
    expect(response.status, `${method} ${path}: ${text}`).toBe(status);
    return JSON.parse(text) as T;
  }
  const post = <T = { id: string }>(path: string, body: unknown, status = 201) => request<T>(path, 'POST', body, status);
  await request('/api/business-profile', 'PUT', { name: 'Kauri October Services Limited', email: 'accounts@kauri.example.test', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-10-01', gstAccountingBasis: 'invoice', gstFilingFrequency: 'monthly', gstPeriodAnchor: 10 });
  const bank = await post('/api/bank-accounts', { accountName: 'Kauri operating bank', accountNumber: '12-0000-0000001-00', bankName: 'Synthetic Bank', accountType: 'checking', currency: 'NZD', openingBalance: '10000' });
  const bankNumber = `BANK-${bank.id.slice(0, 8).toUpperCase()}`;
  const cash = await post('/api/accounts', { name: 'Kauri operating bank', accountNumber: bankNumber, type: 'bank', accountClass: 'asset', currency: 'NZD' });
  const cost = await post('/api/accounts', { name: 'Operating Expenses', accountNumber: '5000', type: 'expense', accountClass: 'expense', currency: 'NZD' });
  const capital = await post('/api/accounts', { name: 'Owner capital', accountNumber: '3000', type: 'custom', accountClass: 'equity', currency: 'NZD' });
  await request('/api/bank-default-account', 'PUT', { bankAccountId: bank.id });
  await post('/api/journal-entries/opening-balances', { date: '2026-09-30', reference: 'Reviewed initial capital working paper', reviewed: true, lines: [{ accountId: cash.id, debit: '10000', credit: '0' }, { accountId: capital.id, debit: '0', credit: '10000' }] });
  const customers = await Promise.all(['A', 'B'].map(label => post('/api/customers', { name: `Kauri client ${label}`, email: `client-${label.toLowerCase()}@example.test` })));
  const invoices = [];
  for (const [index, rate] of ['2000', '1000'].entries()) {
    const invoice = await post('/api/invoices', { customerId: customers[index].id, date: `2026-10-0${index + 2}`, dueDate: '2026-10-31', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: `October services ${index ? 'B' : 'A'}`, quantity: '1', rate }] });
    await request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' }); invoices.push(invoice);
  }
  const receipts = [];
  for (const [index, invoice] of invoices.entries()) receipts.push(await post('/api/payments', { invoiceId: invoice.id, amount: '1150', paymentDate: `2026-10-0${index + 5}`, paymentMethod: 'bank_transfer' }));
  const vendor = await post('/api/vendors', { name: 'Kauri subcontractor' });
  const bill = await post('/api/bills', { vendorId: vendor.id, issueDate: '2026-10-04', dueDate: '2026-10-31', taxInclusive: false, currency: 'NZD', lines: [{ description: 'October subcontracting', quantity: '1', unitPrice: '1000', taxRate: '15', accountId: cost.id }] });
  await post(`/api/bills/${bill.id}/receive`, {}, 200);
  const supplier = await post<{ payments: Array<{ id: string }> }>(`/api/bills/${bill.id}/payments`, { bankAccountId: bank.id, amount: '575', paymentDate: '2026-10-08' });
  const expense = await post('/api/expenses', { description: 'October operating expense', amount: '230', taxAmount: '30', gstTreatment: 'standard', currency: 'NZD', expenseDate: '2026-10-09', status: 'approved', accountId: cash.id });
  const credits = [];
  for (const [index, rate] of ['200', '100'].entries()) credits.push(await post('/api/credit-notes', { invoiceId: invoices[index].id, issueDate: `2026-10-${index + 10}`, reason: 'Reviewed service reduction agreed with client', taxInclusive: false, taxRate: '15', items: [{ description: 'Service reduction', quantity: '1', rate }] }));
  const refund = await post(`/api/credit-notes/${credits[1].id}/refunds`, { amount: '115', refundDate: '2026-10-12', bankAccountId: bank.id });
  const rawRequest = (path: string) => app.request(path, { headers });
  return { db, sql, app, request, rawRequest, post, commands, bank, bankNumber, cash, capital, cost, customers, invoices, receipts, bill, supplier: supplier.payments[0], expense, credits, refund };
}
