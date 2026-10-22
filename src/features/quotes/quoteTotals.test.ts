import { describe, expect, it } from 'vitest';
import { previewQuoteTotals } from './quoteTotals';
import type { LineItem } from '@/types';

const line: LineItem = {
  id: 'line-1',
  description: 'Workshop',
  quantity: 1,
  unit: 'ea',
  rate: 100,
  rateUnit: 'ea',
  total: 100,
};

describe('previewQuoteTotals', () => {
  it('prices exclusive and inclusive GST with the API totals function', () => {
    const exclusive = previewQuoteTotals({
      items: [line],
      taxInclusive: false,
      taxEnabled: true,
      taxRate: 15,
      discountType: 'fixed',
      discountValue: 0,
      discountPercent: 0,
      additionalCharges: 0,
    });
    const inclusive = previewQuoteTotals({
      items: [line],
      taxInclusive: true,
      taxEnabled: true,
      taxRate: 15,
      discountType: 'fixed',
      discountValue: 0,
      discountPercent: 0,
      additionalCharges: 0,
    });

    expect(exclusive).toMatchObject({ subtotal: '100.00', taxAmount: '15.00', total: '115.00', taxInclusive: false });
    expect(inclusive.taxInclusive).toBe(true);
    expect(inclusive.total).toBe('100.00');
    expect(Number(inclusive.taxAmount)).toBeGreaterThan(0);
    expect(Number(inclusive.subtotal)).toBeLessThan(100);
  });
});
