import {
  createBillPaymentDraft,
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
});
