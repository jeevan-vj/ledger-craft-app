import {
  calculateBillDraftTotals,
  createBillPaymentDraft,
  hasBillFormChanged,
  isBillDateRangeValid,
  moveDueDateForward,
} from './purchaseForms';

describe('purchase form state', () => {
  it('rejects a bill due date before its issue date', () => {
    expect(isBillDateRangeValid('2026-11-10', '2026-11-09')).toBe(false);
    expect(isBillDateRangeValid('2026-11-10', '2026-11-10')).toBe(true);
  });

  it('moves an obsolete due date forward when the issue date changes', () => {
    expect(moveDueDateForward('2026-11-10', '2026-10-20')).toBe('2026-11-10');
    expect(moveDueDateForward('2026-11-10', '2026-11-30')).toBe('2026-11-30');
  });

  it('creates a fresh payment draft from the current bill balance', () => {
    expect(createBillPaymentDraft('37.45', '2026-10-03')).toEqual({
      bankAccountId: '',
      amount: '37.45',
      paymentDate: '2026-10-03',
      referenceNumber: '',
    });
  });

  it('detects unsaved bill changes while ignoring equivalent object identity', () => {
    const initial = {
      vendorId: 'vendor-1',
      issueDate: '2026-10-18',
      dueDate: '2026-11-07',
      currency: 'NZD',
      taxInclusive: true,
      notes: null,
      vendorReference: null,
      lines: [{ description: 'Hosting', quantity: '1', unitPrice: '20.00', taxRate: '15', accountId: 'account-1' }],
    };

    expect(hasBillFormChanged({ ...initial, lines: [...initial.lines] }, initial)).toBe(false);
    expect(hasBillFormChanged({ ...initial, notes: 'October' }, initial)).toBe(true);
  });

  it('calculates draft totals with decimal arithmetic', () => {
    expect(calculateBillDraftTotals([
      { description: 'Micro items', quantity: '3', unitPrice: '0.10', taxRate: '15', accountId: 'account-1' },
    ], false)).toEqual({ subtotal: '0.30', tax: '0.05', total: '0.35' });
  });
});
