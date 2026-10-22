import { describe, expect, it } from 'vitest';
import { invoiceDisplayTaxRate } from '@/utils/invoiceUtils';

describe('invoiceDisplayTaxRate', () => {
  it('keeps exclusive GST as tax divided by subtotal minus discount', () => {
    expect(invoiceDisplayTaxRate({
      subtotal: 100,
      taxAmount: 13.5,
      discount: 10,
      taxInclusive: false,
    })).toBe('15.00');
  });

  it('uses the exclusive subtotal when the price already includes GST', () => {
    expect(invoiceDisplayTaxRate({
      subtotal: 100,
      taxAmount: 15,
      discount: 10,
      taxInclusive: true,
    })).toBe('15.00');
  });
});
