import { assistantScreenLink } from './assistantLinks';

const invoiceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('assistant screen links', () => {
  it('opens the invoice list, a saved draft, and expenses', () => {
    expect(assistantScreenLink('/invoices')).toEqual({
      tab: 'Invoices',
      params: { state: { index: 0, routes: [{ name: 'InvoiceList' }] } },
    });
    expect(assistantScreenLink(`/invoices/${invoiceId}`)).toEqual({
      tab: 'Invoices',
      params: {
        state: {
          index: 1,
          routes: [{ name: 'InvoiceList' }, { name: 'InvoiceDetail', params: { invoiceId } }],
        },
      },
    });
    expect(assistantScreenLink('/expenses')).toEqual({
      tab: 'More',
      params: { state: { index: 1, routes: [{ name: 'SettingsList' }, { name: 'ExpenseList' }] } },
    });
  });

  it('falls back to the invoice form for an unknown path', () => {
    expect(assistantScreenLink('/reports')).toEqual({
      tab: 'Invoices',
      params: {
        state: {
          index: 1,
          routes: [{ name: 'InvoiceList' }, { name: 'InvoiceCreate' }],
        },
      },
    });
  });
});
