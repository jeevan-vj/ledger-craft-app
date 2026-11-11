import { describe, expect, it } from 'vitest';
import { applySalesTaxCode, lineSalesTaxCode } from './salesTaxCode';
import type { LineItem } from '@/types';

const line = (patch: Partial<LineItem> = {}): LineItem => ({
  id: '1', description: 'Work', quantity: 1, unit: 'ea', rate: 100, rateUnit: 'ea', total: 100, ...patch,
});

describe('invoice line sales tax codes', () => {
  it('defaults a GST line to standard 15% and requires a choice for a 0% line', () => {
    expect(lineSalesTaxCode(line(), true)).toBe('standard_15');
    expect(lineSalesTaxCode(line({ taxCode: 'standard_15' }), false)).toBe('');
    expect(lineSalesTaxCode(line({ taxes: [] }), true)).toBe('');
    expect(lineSalesTaxCode(line({ taxCode: 'exempt', taxes: [] }), false)).toBe('exempt');
  });

  it('clears GST when the line is zero-rated or exempt', () => {
    expect(applySalesTaxCode(line({ taxes: [{ id: 'gst', name: 'GST', rate: 15 }] }), 'zero_rated').taxes).toEqual([]);
    expect(applySalesTaxCode(line({ taxes: [] }), 'standard_15').taxCode).toBe('standard_15');
    expect(applySalesTaxCode(line({ taxes: [] }), 'standard_15').taxes).toBeUndefined();
  });
});
