import { formatMoney } from '../money';

describe('formatMoney', () => {
  it('formats NZD with the en-NZ currency style', () => {
    expect(formatMoney(1250.5, 'NZD')).toBe('$1,250.50');
  });

  it('defaults to NZD and treats non-finite amounts as zero', () => {
    expect(formatMoney(Number.NaN)).toBe('$0.00');
  });
});
