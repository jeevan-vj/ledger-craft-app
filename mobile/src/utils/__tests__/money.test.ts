import { formatMoney } from '../money';

describe('formatMoney', () => {
  it('formats NZD with the en-NZ currency style', () => {
    expect(formatMoney(1250.5, 'NZD')).toBe('$1,250.50');
  });

  it('defaults to NZD and treats non-finite amounts as zero', () => {
    expect(formatMoney(Number.NaN)).toBe('$0.00');
  });

  it('formats canonical decimal strings without losing precision', () => {
    expect(formatMoney('9007199254740993.25', 'NZD')).toBe('$9,007,199,254,740,993.25');
  });
});
