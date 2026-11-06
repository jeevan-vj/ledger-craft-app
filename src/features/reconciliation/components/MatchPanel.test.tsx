import { describe, expect, it } from 'vitest';
import { calculateAmountLeft } from './reconciliationMath';

describe('MatchPanel amount-left logic', () => {
  it('subtracts several document allocations without losing decimal precision', () => {
    expect(calculateAmountLeft('150.00', [{ amount: '75.25' }, { amount: '24.75' }], [], '')).toEqual({
      allocated: '100.00',
      amountLeft: '50.00',
      overflow: false,
      complete: false,
    });
  });

  it('blocks completion when allocations exceed the bank amount', () => {
    expect(calculateAmountLeft('100.00', [{ amount: '80.00' }, { amount: '25.00' }], [], '')).toEqual({
      allocated: '105.00',
      amountLeft: '-5.00',
      overflow: true,
      complete: false,
    });
  });

  it('uses a small bank-fee remainder to complete the match', () => {
    expect(calculateAmountLeft('102.50', [{ amount: '100.00' }], [], '2.50')).toEqual({
      allocated: '102.50',
      amountLeft: '0.00',
      overflow: false,
      complete: true,
    });
  });

  it('includes a ledger split in the exact amount left', () => {
    expect(calculateAmountLeft('250.00', [{ amount: '200.00' }], [{ amount: '50.00' }], '')).toEqual({
      allocated: '250.00',
      amountLeft: '0.00',
      overflow: false,
      complete: true,
    });
  });
});
