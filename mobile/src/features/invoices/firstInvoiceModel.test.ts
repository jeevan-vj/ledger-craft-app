import {
  buildInvoiceDraft,
  customerStepError,
  defaultInvoiceDates,
  invoiceTotals,
  lineStepError,
  matchedCustomerId,
  newInvoiceDefaults,
  parseMoneyInput,
} from './firstInvoiceModel';

describe('first invoice defaults', () => {
  it('turns GST on only when the business said it is registered', () => {
    expect(newInvoiceDefaults({
      country: 'New Zealand',
      gstRegistrationStatus: 'registered',
      defaultTaxRate: 15,
    })).toEqual({ currency: 'NZD', taxEnabled: true, taxRate: 15 });

    expect(newInvoiceDefaults({
      country: 'Australia',
      gstRegistrationStatus: 'registered',
      defaultTaxRate: 10,
    })).toEqual({ currency: 'AUD', taxEnabled: true, taxRate: 10 });

    expect(newInvoiceDefaults({
      country: 'New Zealand',
      gstRegistrationStatus: 'not_registered',
      defaultTaxRate: 15,
    })).toEqual({ currency: 'NZD', taxEnabled: false, taxRate: 0 });

    expect(newInvoiceDefaults({
      country: 'United Kingdom',
      gstRegistrationStatus: 'registered',
      defaultTaxRate: 0,
    })).toEqual({ currency: 'GBP', taxEnabled: true, taxRate: 20 });
  });

  it('uses the country currency and falls back to NZD', () => {
    expect(newInvoiceDefaults({ country: 'Singapore', gstRegistrationStatus: 'not_registered' }).currency).toBe('SGD');
    expect(newInvoiceDefaults(null)).toEqual({ currency: 'NZD', taxEnabled: false, taxRate: 0 });
    expect(newInvoiceDefaults({ country: 'Other', gstRegistrationStatus: 'unknown' }).currency).toBe('NZD');
  });

  it('selects only the customer the user asked for', () => {
    const customers = [{ id: 'first' }, { id: 'asked' }];
    expect(matchedCustomerId(customers, 'asked')).toBe('asked');
    expect(matchedCustomerId(customers, 'missing')).toBeNull();
    expect(matchedCustomerId(customers)).toBeNull();
  });

  it('checks the customer and the line before review', () => {
    expect(customerStepError({ name: 'A', email: '' })).toBeTruthy();
    expect(customerStepError({ name: 'Harbour Cafe', email: 'not-an-email' })).toBeTruthy();
    expect(customerStepError({ name: 'Harbour Cafe', email: '' })).toBeNull();
    expect(customerStepError({ selectedId: 'c1', name: '', email: 'bad' })).toBeNull();
    expect(lineStepError('A', '10')).toBeTruthy();
    expect(lineStepError('Logo design', '0')).toBeTruthy();
    expect(lineStepError('Logo design', '80.5')).toBeNull();
    expect(parseMoneyInput('1,200.50')).toBe(1200.5);
  });

  it('adds GST in cents and dates the draft locally', () => {
    expect(invoiceTotals(80, true, 10)).toEqual({ subtotal: 80, taxAmount: 8, total: 88 });
    expect(invoiceTotals(10.1, true, 15)).toEqual({ subtotal: 10.1, taxAmount: 1.52, total: 11.62 });
    expect(invoiceTotals(80, false, 15).taxAmount).toBe(0);

    const dates = defaultInvoiceDates(new Date(2026, 0, 15, 22, 30));
    expect(dates).toEqual({ date: '2026-01-15', dueDate: '2026-02-14' });

    const draft = buildInvoiceDraft({
      invoiceNumber: 'INV-2026-0004',
      customerId: 'c1',
      description: 'Logo design',
      amount: 80,
      currency: 'AUD',
      taxEnabled: true,
      taxRate: 10,
      notes: 'Thanks',
      terms: null,
      dates,
    });
    expect(draft.invoice).toEqual(expect.objectContaining({
      currency: 'AUD',
      taxAmount: 8,
      total: 88,
      status: 'draft',
      date: '2026-01-15',
      dueDate: '2026-02-14',
    }));
    expect(draft.lineItems).toEqual([
      expect.objectContaining({ description: 'Logo design', quantity: 1, rate: 80, total: 80 }),
    ]);
  });
});
