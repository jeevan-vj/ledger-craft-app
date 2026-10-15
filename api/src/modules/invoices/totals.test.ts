import { describe, expect, it } from 'vitest';
import { computeInvoiceTotals } from './totals';

const exclusiveThousand = {
  taxInclusive: false,
  taxRate: '15',
  items: [{ description: 'Consulting', quantity: '1', rate: '1000' }],
};

describe('computeInvoiceTotals discount order', () => {
  it('applies 10% of exclusive subtotal then GST on 900', () => {
    const totals = computeInvoiceTotals(
      { ...exclusiveThousand, discountType: 'percent', discountPercent: '10' },
      15,
    );
    expect(totals.subtotal).toBe('1000.00');
    expect(totals.discountType).toBe('percent');
    expect(totals.discountPercent).toBe('10.00');
    expect(totals.discount).toBe('100.00');
    expect(totals.taxAmount).toBe('135.00');
    expect(totals.total).toBe('1035.00');
  });

  it('applies a fixed discount then GST on the remainder', () => {
    const totals = computeInvoiceTotals(
      { ...exclusiveThousand, discountType: 'fixed', discount: '50' },
      15,
    );
    expect(totals.discount).toBe('50.00');
    expect(totals.taxAmount).toBe('142.50');
    expect(totals.total).toBe('1092.50');
  });

  it('zeros GST and total on a 100% discount', () => {
    const totals = computeInvoiceTotals(
      { ...exclusiveThousand, discountType: 'percent', discountPercent: '100' },
      15,
    );
    expect(totals.discount).toBe('1000.00');
    expect(totals.taxAmount).toBe('0.00');
    expect(totals.total).toBe('0.00');
  });

  it('rejects a fixed discount above the subtotal', () => {
    expect(() =>
      computeInvoiceTotals(
        { ...exclusiveThousand, discountType: 'fixed', discount: '1000.01' },
        15,
      ),
    ).toThrow(/can't exceed the subtotal/);
  });

  it('recomputes percent amount when the subtotal changes', () => {
    const first = computeInvoiceTotals(
      { ...exclusiveThousand, discountType: 'percent', discountPercent: '10' },
      15,
    );
    const second = computeInvoiceTotals(
      {
        taxInclusive: false,
        taxRate: '15',
        discountType: 'percent',
        discountPercent: '10',
        items: [{ description: 'Consulting', quantity: '2', rate: '1000' }],
      },
      15,
    );
    expect(first.discount).toBe('100.00');
    expect(second.discount).toBe('200.00');
    expect(second.taxAmount).toBe('270.00');
  });
});
