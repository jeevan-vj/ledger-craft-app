import { describe, expect, it } from 'vitest';
import { calculatePlatformFeeCents } from './stripe.fees';

describe('Stripe platform fee calculation', () => {
  it('uses basis points plus a fixed fee with integer rounding', () => {
    expect(calculatePlatformFeeCents(10_000, { basisPoints: 400, fixedCents: 30 })).toBe(430);
    expect(calculatePlatformFeeCents(12_345, { basisPoints: 400, fixedCents: 30 })).toBe(524);
  });

  it('never consumes the whole payment', () => {
    expect(calculatePlatformFeeCents(50, { basisPoints: 10_000, fixedCents: 500 })).toBe(49);
  });

  it('rejects invalid configuration', () => {
    expect(() => calculatePlatformFeeCents(1000, { basisPoints: -1, fixedCents: 0 })).toThrow();
    expect(() => calculatePlatformFeeCents(1000, { basisPoints: 100, fixedCents: -1 })).toThrow();
  });
});
