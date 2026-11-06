import { describe, expect, it } from 'vitest';
import { fxRevaluationPreviewRequestSchema, fxRevaluationRequestSchema } from './fx-revaluation';
const id = '00000000-0000-4000-8000-000000000001';
describe('reviewed period-end valuation contract', () => {
  it('requires actual dates, explicit reviewed rates and a review reason', () => {
    expect(fxRevaluationPreviewRequestSchema.safeParse({ asOfDate: '2026-10-31', exchangeRateIds: [id], reason: 'October review' }).success).toBe(true);
    expect(fxRevaluationPreviewRequestSchema.safeParse({ asOfDate: '2026-02-30', exchangeRateIds: [id], reason: 'October review' }).success).toBe(false);
    expect(fxRevaluationPreviewRequestSchema.safeParse({ asOfDate: '2026-10-31', exchangeRateIds: [], reason: 'October review' }).success).toBe(false);
    expect(fxRevaluationRequestSchema.safeParse({ asOfDate: '2026-10-31', exchangeRateIds: [id], reason: 'October review' }).success).toBe(false);
    expect(fxRevaluationRequestSchema.safeParse({ asOfDate: '2026-10-31', exchangeRateIds: [id], reason: 'October review', reviewed: true }).success).toBe(true);
  });
});
