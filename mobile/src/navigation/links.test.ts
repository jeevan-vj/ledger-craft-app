import { describe, expect, it } from '@jest/globals';
import { getStateFromPath } from '@react-navigation/native';
import { customerTabParams, homeQuickActionLink, invoiceTabParams, mainTabs, mobileLinking, moreMenuSections, moreTabParams, stackAbove } from './links';

describe('mobile navigation links', () => {
  it('keeps customers as a tab and expenses and purchases under More', () => {
    expect(mainTabs).toEqual(['Dashboard', 'Invoices', 'Customers', 'More']);
    const screens = moreMenuSections.flatMap((section) => section.rows.map((row) => row.screen));
    expect(screens).toEqual([
      'Reports',
      'ItemList',
      'BankAccountList',
      'BusinessSettings',
      'CompanyTeam',
      'ExpenseList',
      'PurchaseList',
    ]);
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

  it('sends each home quick action to its own screen', () => {
    expect(homeQuickActionLink('newInvoice')).toEqual({
      tab: 'Invoices',
      params: invoiceTabParams({ name: 'InvoiceCreate' }),
    });
    expect(homeQuickActionLink('newQuote')).toEqual({
      tab: 'Invoices',
      params: {
        state: {
          index: 2,
          routes: [
            { name: 'InvoiceList' },
            { name: 'QuoteList' },
            { name: 'QuoteCreate' },
          ],
        },
      },
    });
    expect(homeQuickActionLink('recordPayment')).toEqual({
      tab: 'Invoices',
      params: invoiceTabParams({ name: 'InvoiceList' }),
    });
    expect(homeQuickActionLink('addExpense')).toEqual({
      tab: 'More',
      params: moreTabParams({ name: 'ExpenseCreate' }),
    });
    expect(homeQuickActionLink('addCustomer')).toEqual({
      tab: 'Customers',
      params: customerTabParams({ name: 'CustomerCreate' }),
    });
  });

  it('routes HTTPS and app-scheme public invoice links without authentication', () => {
    expect(mobileLinking.prefixes).toContain('https://easybiz.iamjeevan.com');
    expect(mobileLinking.prefixes).toContain('easybizinvoice://');
    expect(mobileLinking.config?.screens).toMatchObject({
      PublicInvoice: 'shared/invoice/:shareToken',
      PublicQuote: 'shared/quote/:shareToken',
    });
  });

  it('resolves a public quote, quote detail, and the converted invoice', () => {
    const publicQuote = getStateFromPath('shared/quote/org_token', mobileLinking.config);
    const quote = getStateFromPath('quotes/quote-1', mobileLinking.config);
    const invoice = getStateFromPath('invoices/invoice-1', mobileLinking.config);
    expect(JSON.stringify(publicQuote)).toContain('PublicQuote');
    expect(JSON.stringify(publicQuote)).toContain('org_token');
    expect(JSON.stringify(quote)).toContain('QuoteDetail');
    expect(JSON.stringify(quote)).toContain('quote-1');
    expect(JSON.stringify(invoice)).toContain('InvoiceDetail');
    expect(JSON.stringify(invoice)).toContain('invoice-1');
  });
});
