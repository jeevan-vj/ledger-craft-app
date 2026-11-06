import { bankFeeEligible, calculateAmountLeft, suggestedAllocationAmount } from './reconciliationMath';

describe('reconciliation amount math', () => {
  it('keeps multi-document allocations exact and calculates amount left', () => {
    expect(calculateAmountLeft('150.00', [{ amount: '60.10' }, { amount: '39.90' }], [], '')).toEqual({
      allocated: '100.00', amountLeft: '50.00', overflow: false, complete: false,
    });
    expect(suggestedAllocationAmount('150.00', '100.00', '60.10')).toBe('89.90');
  });

  it('blocks overflow', () => {
    expect(calculateAmountLeft('100.00', [{ amount: '100.01' }], [], '').overflow).toBe(true);
  });

  it('completes with a small debit bank fee remainder', () => {
    const state = calculateAmountLeft('100.00', [{ amount: '98.00' }], [], '2.00');
    expect(state).toMatchObject({ amountLeft: '0.00', complete: true, overflow: false });
    expect(bankFeeEligible('debit', '100.00', '2.00')).toBe(true);
    expect(bankFeeEligible('credit', '100.00', '2.00')).toBe(false);
  });

  it('completes with an exact split remainder', () => {
    expect(calculateAmountLeft('150.00', [{ amount: '100.00' }], [{ amount: '50.00' }], '')).toMatchObject({
      allocated: '150.00', amountLeft: '0.00', complete: true,
    });
  });
});
