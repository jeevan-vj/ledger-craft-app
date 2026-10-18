import type { Invoice } from '@/types/invoice';
import {
  hasCustomerFormChanged,
  summarizeCustomerInvoices,
  validateCustomerDraft,
} from './customerForms';

describe('customer form state', () => {
  it('requires a name and rejects malformed optional email addresses', () => {
    expect(validateCustomerDraft({ name: '  ', email: '', phone: '', address: '', city: '', state: '', zip: '', country: 'NZ', isVip: false })).toEqual({
      name: 'Enter a customer name',
    });
    expect(validateCustomerDraft({ name: 'Aroha', email: 'not-an-email', phone: '', address: '', city: '', state: '', zip: '', country: 'NZ', isVip: false })).toEqual({
      email: 'Enter a valid email address',
    });
    expect(validateCustomerDraft({ name: 'Aroha', email: 'aroha@example.nz', phone: '', address: '', city: '', state: '', zip: '', country: 'NZ', isVip: false })).toEqual({});
  });

  it('detects meaningful edits after normalizing optional values', () => {
    const original = { name: 'Aroha', email: '', phone: '', address: '', city: '', state: '', zip: '', country: 'NZ', isVip: false };
    expect(hasCustomerFormChanged({ ...original }, original)).toBe(false);
    expect(hasCustomerFormChanged({ ...original, phone: '021 123 456' }, original)).toBe(true);
  });

  it('summarizes customer invoices with exact decimal arithmetic', () => {
    const invoices = [
      { id: 'one', status: 'sent', total: 0.1, totalPaid: 0, balanceDue: 0.1, currency: 'NZD' },
      { id: 'two', status: 'paid', total: 0.2, totalPaid: 0.2, balanceDue: 0, currency: 'NZD' },
      { id: 'three', status: 'overdue', total: 12.34, totalPaid: 2.34, balanceDue: 10, currency: 'NZD' },
      { id: 'draft', status: 'draft', total: 50, totalPaid: 0, balanceDue: 50, currency: 'NZD' },
    ] as Invoice[];

    expect(summarizeCustomerInvoices(invoices)).toEqual({
      invoiceCount: 4,
      billed: '62.64',
      paid: '2.54',
      outstanding: '10.10',
      currency: 'NZD',
    });
  });
});
