import { describe, expect, it } from 'vitest';
import { apiError } from '../../http-error';
import {
  QUOTE_TRANSITIONS,
  assertConversionTotals,
  assertQuoteTransition,
  aucklandToday,
  effectiveStatus,
} from './quotes.transitions';

describe('quote transitions', () => {
  it('uses the Pacific/Auckland calendar date', () => {
    expect(aucklandToday(new Date('2026-10-21T10:00:00.000Z'))).toBe('2026-10-21');
    expect(aucklandToday(new Date('2026-10-21T12:00:00.000Z'))).toBe('2026-10-22');
  });

  it('expires sent and viewed quotes only after the expiry date', () => {
    expect(effectiveStatus('sent', '2026-10-21', '2026-10-22')).toBe('expired');
    expect(effectiveStatus('viewed', '2026-10-21', '2026-10-22')).toBe('expired');
    expect(effectiveStatus('sent', '2026-10-22', '2026-10-22')).toBe('sent');
    expect(effectiveStatus('draft', '2026-10-01', '2026-10-22')).toBe('draft');
    expect(effectiveStatus('accepted', '2026-10-01', '2026-10-22')).toBe('accepted');
    expect(effectiveStatus('converted', '2026-10-01', '2026-10-22')).toBe('converted');
  });

  it('names the current status for a forbidden transition and allows the lifecycle edges', () => {
    expect(() => assertQuoteTransition('draft', 'accepted')).toThrow(/draft/);
    expect(() => assertQuoteTransition('declined', 'converted')).toThrow(/declined/);
    expect(() => assertQuoteTransition('converted', 'draft')).toThrow(/converted/);
    expect(() => assertQuoteTransition('accepted', 'draft')).toThrow(/accepted/);
    for (const [from, targets] of Object.entries(QUOTE_TRANSITIONS)) {
      for (const to of targets) {
        expect(() => assertQuoteTransition(from as keyof typeof QUOTE_TRANSITIONS, to)).not.toThrow();
      }
    }
  });

  it('rejects a converted invoice whose totals differ', () => {
    const quote = { subtotal: '100.00', taxAmount: '15.00', discount: null, total: '115.00' };
    expect(() => assertConversionTotals(quote, quote)).not.toThrow();
    try {
      assertConversionTotals(quote, { ...quote, total: '0.00' });
      throw new Error('expected mismatch');
    } catch (error) {
      expect(apiError(500, 'CONVERSION_TOTALS_MISMATCH', 'x').cause).toEqual((error as { cause?: unknown }).cause);
    }
  });
});
