import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';

afterEach(() => vi.useRealTimers());
const settings = { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-11-01', gstAccountingBasis: 'invoice', gstFilingFrequency: 'monthly', gstPeriodAnchor: 11 };
const period = '/api/tax/gst-preparation?from=2026-11-01&to=2026-11-30';
function november() { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-07T00:00:00Z')); }

describe('GST registration follows original source eligibility across later reversals', () => {
  it('does not reverse an excluded pre-registration expense claim into the first GST return', async () => withTestDb(async () => {
    november(); const f = await settlementFixture();
    try {
      const expense = await f.request('/api/expenses', 'POST', { description: 'Pre-registration receipt', amount: '230', taxAmount: '30', gstTreatment: 'standard', expenseDate: '2026-10-10', currency: 'NZD', status: 'approved' }, 201);
      await f.request('/api/tax/gst-settings', 'PUT', settings);
      await f.request(`/api/expenses/${expense.id}`, 'DELETE', undefined, 204);
      for (const basis of ['invoice', 'payments', 'hybrid']) {
        await f.request('/api/tax/gst-settings', 'PUT', { ...settings, gstAccountingBasis: basis });
        expect(await f.request(period, 'GET')).toMatchObject({ totalPurchases: '0.00', gstOnPurchases: '0.00', netGstPosition: '0.00' });
      }
    } finally { await f.sql.end(); }
  }));

  it('does not include cancellation of an excluded pre-registration invoice as negative taxable sales', async () => withTestDb(async () => {
    november(); const f = await settlementFixture();
    try {
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-31', currency: 'NZD', taxRate: '15', taxInclusive: false, items: [{ description: 'Pre-registration services', quantity: '1', rate: '100' }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      await f.request('/api/tax/gst-settings', 'PUT', settings);
      await f.request(`/api/invoices/${invoice.id}/cancel`, 'POST', { reason: 'Historical source cancelled after registration' });
      expect(await f.request(period, 'GET')).toMatchObject({ totalSales: '0.00', gstOnSales: '0.00', netGstPosition: '0.00' });
    } finally { await f.sql.end(); }
  }));

  it('does not reclaim a voided pre-registration supplier bill in the first GST return', async () => withTestDb(async () => {
    november(); const f = await settlementFixture();
    try {
      const bill = await f.request('/api/bills', 'POST', { vendorId: f.vendor.id, issueDate: '2026-10-10', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Pre-registration contractor', quantity: '1', unitPrice: '115', taxRate: '15', accountId: f.cost.id }] }, 201);
      await f.request(`/api/bills/${bill.id}/receive`, 'POST', {});
      await f.request('/api/tax/gst-settings', 'PUT', settings);
      await f.request(`/api/bills/${bill.id}/void`, 'POST', {});
      expect(await f.request(period, 'GET')).toMatchObject({ totalPurchases: '0.00', gstOnPurchases: '0.00', netGstPosition: '0.00' });
    } finally { await f.sql.end(); }
  }));

  it('does not include a later customer credit and refund for an excluded pre-registration supply', async () => withTestDb(async () => {
    november(); const f = await settlementFixture();
    try {
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-31', currency: 'NZD', taxRate: '15', taxInclusive: false, items: [{ description: 'Pre-registration paid services', quantity: '1', rate: '100' }] }, 201);
      await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount: '115', paymentDate: '2026-10-10', paymentMethod: 'bank_transfer' }, 201);
      await f.request('/api/tax/gst-settings', 'PUT', settings);
      const post = async (path: string, body: unknown) => {
        const response = await f.app.request(path, { method: 'POST', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json', Cookie: f.cookie, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
        const value = await response.json() as { id: string };
        expect(response.status, JSON.stringify(value)).toBe(201); return value;
      };
      const credit = await post('/api/credit-notes', { invoiceId: invoice.id, issueDate: '2026-11-07', reason: 'Refund for excluded pre-registration supply', taxInclusive: false, taxRate: '15', items: [{ description: 'Historical source credit', quantity: '1', rate: '100' }] });
      await post(`/api/credit-notes/${credit.id}/refunds`, { bankAccountId: f.bank.id, amount: '115', refundDate: '2026-11-07' });
      for (const basis of ['invoice', 'payments', 'hybrid']) {
        await f.request('/api/tax/gst-settings', 'PUT', { ...settings, gstAccountingBasis: basis });
        expect(await f.request(period, 'GET')).toMatchObject({ totalSales: '0.00', gstOnSales: '0.00', netGstPosition: '0.00' });
      }
    } finally { await f.sql.end(); }
  }));
});
