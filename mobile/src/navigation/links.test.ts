import { describe, expect, it } from '@jest/globals';
import { customerTabParams, invoiceTabParams, mainTabs, moreMenuSections, moreTabParams, stackAbove } from './links';

describe('mobile navigation links', () => {
  it('keeps customers as a tab and expenses and purchases under More', () => {
    expect(mainTabs).toEqual(['Dashboard', 'Invoices', 'Customers', 'More']);
    const screens = moreMenuSections.flatMap((section) => section.rows.map((row) => row.screen));
    expect(screens).toEqual(['BusinessSettings', 'ExpenseList', 'PurchaseList']);
    expect(screens).not.toContain('CustomerList');
  });

  it('opens an invoice with the list underneath so Back is not a dead end', () => {
    expect(invoiceTabParams({ name: 'InvoiceDetail', params: { invoiceId: 'inv-1' } })).toEqual({
      state: {
        index: 1,
        routes: [
          { name: 'InvoiceList' },
          { name: 'InvoiceDetail', params: { invoiceId: 'inv-1' } },
        ],
      },
    });
    expect(invoiceTabParams({ name: 'InvoiceCreate' }).state.routes.map((route) => route.name)).toEqual([
      'InvoiceList',
      'InvoiceCreate',
    ]);
    expect(invoiceTabParams({ name: 'InvoiceList' })).toEqual({
      state: { index: 0, routes: [{ name: 'InvoiceList' }] },
    });
  });

  it('opens More destinations above the More root', () => {
    expect(moreTabParams({ name: 'ExpenseCreate' }).state).toEqual({
      index: 1,
      routes: [{ name: 'SettingsList' }, { name: 'ExpenseCreate' }],
    });
    expect(moreTabParams({ name: 'BusinessSettings' }).state.routes[0]).toEqual({ name: 'SettingsList' });
    expect(stackAbove('InvoiceList', { name: 'InvoiceList' }).index).toBe(0);
  });

  it('opens customer detail and create screens above the customer list', () => {
    expect(customerTabParams({ name: 'CustomerDetail', params: { customerId: 'customer-1' } })).toEqual({
      state: {
        index: 1,
        routes: [
          { name: 'CustomerList' },
          { name: 'CustomerDetail', params: { customerId: 'customer-1' } },
        ],
      },
    });
    expect(customerTabParams({ name: 'CustomerCreate' }).state.routes.map((route) => route.name)).toEqual([
      'CustomerList',
      'CustomerCreate',
    ]);
  });
});
