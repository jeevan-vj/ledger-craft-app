import { describe, expect, it } from 'vitest';
import { decimal, moneyToCents, roundMoney } from './money';
import { computeInvoiceTotals } from './totals';

describe('exact decimal accounting', () => {
  it('preserves cents above the JavaScript safe integer range', () => {
    expect(roundMoney('9007199254740993.01')).toBe('9007199254740993.01');
    expect(moneyToCents('9007199254740993.01')).toBe(900719925474099301n);
    expect(decimal('9007199254740993.01').sub('9007199254740993.00').toFixed()).toBe('0.01');
  });
  it('rounds decimal ties half away from zero without binary drift', () => {
    expect(roundMoney('1.005')).toBe('1.01');
    expect(roundMoney('-1.005')).toBe('-1.01');
    expect(decimal('0.1').add('0.2').toFixed()).toBe('0.30');
  });
  it('calculates fractional quantity and tax exactly', () => {
    const result = computeInvoiceTotals({ taxInclusive: false, taxRate: '15',
      items: [{ description: 'Fractional', quantity: '0.3', rate: '3.35' }] }, '15');
    expect(result.subtotal).toBe('1.01');
    expect(result.taxAmount).toBe('0.15');
    expect(result.total).toBe('1.16');
  });
  it('retains large totals through a percentage discount', () => {
    const result = computeInvoiceTotals({ taxInclusive: false, taxRate: '0', discountType: 'percent', discountPercent: '10',
      items: [{ description: 'Large', quantity: '1', rate: '9007199254740993.10' }] }, '0');
    expect(result.discount).toBe('900719925474099.31');
    expect(result.total).toBe('8106479329266893.79');
  });
});
