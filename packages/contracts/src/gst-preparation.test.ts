import { describe, expect, it } from 'vitest';
import { gstPreparationQuerySchema, gstPreparationResponseSchema } from './gst-preparation';

describe('GST preparation contract', () => {
  it('accepts ordered real calendar dates and rejects invalid periods and caller-selected ownership/basis', () => {
    expect(gstPreparationQuerySchema.parse({ from: '2026-04-01', to: '2026-06-30' })).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    for (const query of [
      { from: '2026-06-30', to: '2026-04-01' },
      { from: '2026-02-30', to: '2026-06-30' },
      { from: '2026-04-01', to: '2026-06-30', basis: 'payments' },
      { from: '2026-04-01', to: '2026-06-30', organisationId: 'another-company' },
    ]) expect(gstPreparationQuerySchema.safeParse(query).success).toBe(false);
  });

  it('requires exact monetary strings and explicit supported invoice basis', () => {
    const response = { basis: 'invoice', from: '2026-04-01', to: '2026-06-30', baseCurrency: 'NZD', totalSales: '1610.00', totalPurchases: '625.00', gstOnSales: '210.00', gstOnPurchases: '75.00', netGstPosition: '135.00', warnings: [] };
    expect(gstPreparationResponseSchema.parse(response)).toEqual(response);
    expect(gstPreparationResponseSchema.safeParse({ ...response, gstOnSales: 210 }).success).toBe(false);
    expect(gstPreparationResponseSchema.safeParse({ ...response, basis: 'payments' }).success).toBe(false);
    expect(gstPreparationResponseSchema.parse({ ...response, totalSales: '-1150.00', totalPurchases: '-345.00' }).totalSales).toBe('-1150.00');
  });
});
