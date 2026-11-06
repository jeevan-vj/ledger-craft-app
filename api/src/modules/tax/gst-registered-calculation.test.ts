import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { gstPreparationResponseSchema } from '@ledgercraft/contracts';

async function books() {
  const { db, sql } = createDb(getDatabaseUrl());
  const app = createApp({ db, auth: createAuth(db), checkDatabase: async () => true });
  const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'GST accountant', email: `${crypto.randomUUID()}@example.test`, password: 'Local-test-registered-123!' }) });
  const headers = { ...origin, Cookie: signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
  async function request(path: string, method = 'GET', body?: unknown, status = 200) {
    const response = await app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json() as Record<string, unknown>;
    expect(response.status, JSON.stringify(value)).toBe(status);
    return value;
  }
  await request('/api/business-profile', 'PUT', { name: 'Kauri GST Limited', email: 'owner@gst.example.test', country: 'NZ', defaultTaxRate: '15' });
  const customer = await request('/api/customers', 'POST', { name: 'Harbour Cafe', email: 'accounts@harbour.example.test' }, 201);
  const makeSale = async (date: string, net: string, amount: string) => {
    const invoice = await request('/api/invoices', 'POST', { customerId: customer.id, date, dueDate: '2026-05-31', currency: 'NZD', taxRate: '15', taxInclusive: false, items: [{ description: 'Consulting', quantity: '1', rate: net }] }, 201);
    await request('/api/payments', 'POST', { invoiceId: invoice.id, amount, paymentDate: date, paymentMethod: 'bank_transfer' }, 201);
  };
  // These historical books predate the eventual registration decision.
  await makeSale('2026-03-15', '100', '115');
  const settings = { gstRegistrationStatus: 'registered', taxId: '123456785', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'hybrid', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 5 };
  await request('/api/tax/gst-settings', 'PUT', settings);
  await makeSale('2026-04-05', '1000', '575');
  const cost = await request('/api/accounts', 'POST', { name: 'Contractors', type: 'expense', accountClass: 'expense', accountNumber: '5300' }, 201);
  const bank = await request('/api/bank-accounts', 'POST', { accountName: 'Operating', accountNumber: '123', bankName: 'Test', accountType: 'checking' }, 201);
  const vendor = await request('/api/vendors', 'POST', { name: 'Subcontractor' }, 201);
  const bill = await request('/api/bills', 'POST', { vendorId: vendor.id, issueDate: '2026-04-10', dueDate: '2026-05-31', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Work', quantity: '1', unitPrice: '690', taxRate: '15', accountId: cost.id }] }, 201);
  await request(`/api/bills/${bill.id}/receive`, 'POST', {});
  await request(`/api/bills/${bill.id}/payments`, 'POST', { bankAccountId: bank.id, amount: '230', paymentDate: '2026-05-10' }, 201);
  await request('/api/expenses', 'POST', { description: 'Paid office cost', amount: '230', taxAmount: '30', gstTreatment: 'standard', expenseDate: '2026-04-12', currency: 'NZD', status: 'approved' }, 201);
  await request('/api/expenses', 'POST', { description: 'Exempt cost', amount: '50', taxAmount: '0', gstTreatment: 'exempt', expenseDate: '2026-04-12', currency: 'NZD', status: 'approved' }, 201);
  return { sql, request, settings };
}

describe('registered GST basis is the calculation authority', () => {
  it('requires explicit and complete zero-rated versus exempt classification without changing GST', async () => withTestDb(async () => {
    const f = await books();
    try {
      const customer = await f.request('/api/customers', 'POST', { name: 'Export customer', email: 'export@example.test' }, 201);
      const invoice = await f.request('/api/invoices', 'POST', { customerId: customer.id, date: '2026-04-15', dueDate: '2026-05-31', currency: 'NZD', taxRate: '0', taxInclusive: false, items: [{ description: 'Supported untaxed supply', quantity: '1', rate: '500' }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      const period = { from: '2026-04-01', to: '2026-05-31', basis: 'hybrid', reviewConfirmed: true, adjustments: [] };
      expect(await f.request('/api/tax/gst-preparation?from=2026-04-01&to=2026-05-31')).toMatchObject({ unclassifiedSales: '500.00', requiresReview: true });
      await f.request('/api/tax/gst-preparation', 'POST', period, 422);
      const classification = { zeroRatedSales: '500.00', exemptSales: '0.00', reason: 'Export documentation reviewed by accountant', sourceReference: 'EXPORT-001' };
      await f.request('/api/tax/gst-preparation', 'POST', { ...period, salesClassificationReview: { ...classification, zeroRatedSales: '499.00' } }, 422);
      const reviewed = gstPreparationResponseSchema.parse(await f.request('/api/tax/gst-preparation', 'POST', { ...period, salesClassificationReview: classification }));
      expect(reviewed).toMatchObject({ zeroRatedSales: '500.00', exemptSales: '0.00', gstOnSales: '150.00', gstOnPurchases: '60.00', netGstPosition: '90.00' });
      expect(reviewed.review?.salesClassificationReview).toEqual(classification);
      expect(reviewed.calculation?.myIrBoxes['6']).toBe('500.00');
    } finally { await f.sql.end(); }
  }));
  it('uses hybrid invoice sales and paid purchases, rather than silently choosing invoice basis', async () => withTestDb(async () => {
    const f = await books();
    try {
      const hybrid = await f.request('/api/tax/gst-preparation?from=2026-04-01&to=2026-05-31');
      expect(hybrid).toMatchObject({ basis: 'hybrid', totalSales: '1150.00', totalPurchases: '510.00', gstOnSales: '150.00', gstOnPurchases: '60.00', netGstPosition: '90.00' });
      await f.request('/api/tax/gst-preparation?from=2026-04-01&to=2026-05-31&basis=invoice', 'GET', undefined, 422);
      await f.request('/api/tax/gst-settings', 'PUT', { ...f.settings, gstAccountingBasis: 'payments' });
      expect(await f.request('/api/tax/gst-preparation?from=2026-04-01&to=2026-05-31')).toMatchObject({ basis: 'payments', gstOnSales: '75.00', gstOnPurchases: '60.00', netGstPosition: '15.00' });
      await f.request('/api/tax/gst-settings', 'PUT', { ...f.settings, gstAccountingBasis: 'invoice' });
      expect(await f.request('/api/tax/gst-preparation?from=2026-04-01&to=2026-05-31')).toMatchObject({ basis: 'invoice', totalPurchases: '970.00', gstOnSales: '150.00', gstOnPurchases: '120.00', netGstPosition: '30.00' });
    } finally { await f.sql.end(); }
  }));
  it('excludes pre-registration movements and returns a server source/version snapshot', async () => withTestDb(async () => {
    const f = await books();
    try {
      const figures = gstPreparationResponseSchema.parse(await f.request('/api/tax/gst-preparation?from=2026-03-01&to=2026-05-31'));
      expect(figures).toMatchObject({ basis: 'hybrid', totalSales: '1150.00', gstOnSales: '150.00', gstOnPurchases: '60.00' });
      expect(figures.calculation).toMatchObject({ version: 'gst-ledger-v2', settings: { gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'hybrid' } });
      expect(figures.calculation?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(figures.calculation?.sourceIds.journals.length).toBeGreaterThan(0);
    } finally { await f.sql.end(); }
  }));
});
