import { describe, expect, it } from 'vitest';
import { gstPreparationQuerySchema, gstPreparationResponseSchema, gstAdjustmentPreparationRequestSchema } from './gst-preparation';

describe('registered GST hybrid basis', () => {
  it('accepts signed zero-rated credit classifications while retaining exact cents', () => {
    const result = gstAdjustmentPreparationRequestSchema.safeParse({ from: '2026-06-01', to: '2026-07-31', basis: 'invoice', reviewConfirmed: true, adjustments: [], salesClassificationReview: { zeroRatedSales: '-20.00', exemptSales: '0.00', reason: 'Credit for exported service supported', sourceReference: 'CN-EXPORT-001' } });
    expect(result.success).toBe(true);
  });
  it('accepts hybrid on calculations, reviews and returned figures', () => {
    const period = { from: '2026-04-01', to: '2026-05-31', basis: 'hybrid' };
    expect(gstPreparationQuerySchema.safeParse(period).success).toBe(true);
    expect(gstAdjustmentPreparationRequestSchema.safeParse({ ...period, reviewConfirmed: true, adjustments: [] }).success).toBe(true);
    expect(gstPreparationResponseSchema.shape.basis.safeParse('hybrid').success).toBe(true);
  });
  it('retains an explicitly reviewed zero-rated classification instead of guessing from zero GST', () => {
    const review = { zeroRatedSales: '500.00', exemptSales: '0.00', reason: 'Export evidence reviewed by accountant', sourceReference: 'EXPORT-001' };
    const parsed = gstAdjustmentPreparationRequestSchema.safeParse({ from: '2026-04-01', to: '2026-05-31', basis: 'invoice', reviewConfirmed: true, adjustments: [], salesClassificationReview: review });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toHaveProperty('salesClassificationReview', review);
  });
});
