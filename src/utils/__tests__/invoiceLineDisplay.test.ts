import { describe, expect, it } from 'vitest';
import { formatLineQuantity, isGenericInvoiceUnit, showPositiveAmount } from '../invoiceLineDisplay';

describe('formatLineQuantity', () => {
  it('hides generic default units and keeps meaningful ones', () => {
    expect(formatLineQuantity(15, 'each')).toBe('15');
    expect(formatLineQuantity(15, 'Each')).toBe('15');
    expect(formatLineQuantity(15, ' each ')).toBe('15');
    expect(formatLineQuantity(1, 'ea')).toBe('1');
    expect(formatLineQuantity(2, 'unit')).toBe('2');
    expect(formatLineQuantity(2, 'units')).toBe('2');
    expect(formatLineQuantity(4, 'pcs')).toBe('4');
    expect(formatLineQuantity(4, 'PCS')).toBe('4');
    expect(formatLineQuantity(4, 'pc')).toBe('4');
    expect(formatLineQuantity(4, 'piece')).toBe('4');
    expect(formatLineQuantity(4, 'pieces')).toBe('4');
    expect(formatLineQuantity(1, 'kg')).toBe('1 kg');
    expect(formatLineQuantity(2, 'hrs')).toBe('2 hrs');
    expect(formatLineQuantity(1.5, 'kg')).toBe('1.5 kg');
    expect(formatLineQuantity('3', ' box ')).toBe('3 box');
  });

  it('treats a missing unit as generic', () => {
    expect(isGenericInvoiceUnit(null)).toBe(true);
    expect(isGenericInvoiceUnit(undefined)).toBe(true);
    expect(isGenericInvoiceUnit('')).toBe(true);
    expect(isGenericInvoiceUnit('kg')).toBe(false);
    expect(formatLineQuantity(15, null)).toBe('15');
    expect(formatLineQuantity(15, undefined)).toBe('15');
    expect(formatLineQuantity(null, 'kg')).toBe('');
    expect(formatLineQuantity('', 'kg')).toBe('');
  });
});

describe('showPositiveAmount', () => {
  it('is false for zero and non-finite values so a totals row can stay unmounted', () => {
    expect(showPositiveAmount(0)).toBe(false);
    expect(showPositiveAmount(0.0)).toBe(false);
    expect(showPositiveAmount('0')).toBe(false);
    expect(showPositiveAmount('0.00')).toBe(false);
    expect(showPositiveAmount(null)).toBe(false);
    expect(showPositiveAmount(undefined)).toBe(false);
    expect(showPositiveAmount('')).toBe(false);
    expect(showPositiveAmount(Number.NaN)).toBe(false);
    expect(showPositiveAmount(-5)).toBe(false);
  });

  it('is true only for a positive amount', () => {
    expect(showPositiveAmount(0.01)).toBe(true);
    expect(showPositiveAmount(210)).toBe(true);
    expect(showPositiveAmount('12.50')).toBe(true);
  });
});
