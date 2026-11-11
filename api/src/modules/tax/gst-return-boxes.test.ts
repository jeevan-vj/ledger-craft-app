import { describe, expect, it } from 'vitest';
import { adjustmentBoxAmount, customsClaimDate, normalizeGstAdjustment, roundingDifference, roundingNeedsAcknowledgement, sumAdjustmentBox } from './gst-return-boxes';

describe('typed GST adjustments and form rounding', () => {
  it('maps a free-text adjustment to other and keeps its amount', () => {
    expect(normalizeGstAdjustment({ kind: 'output', amount: '-15.00', grossAdjustment: '-115.00', reason: 'Credit note issued for services returned', sourceReference: 'CN-001' })).toEqual({
      kind: 'output', type: 'other', amount: '-15.00', grossAdjustment: '-115.00', reason: 'Credit note issued for services returned', sourceReference: 'CN-001', note: 'Credit note issued for services returned',
    });
  });

  it('puts a GST-only adjustment in the box and leaves a matching gross change out of that box', () => {
    expect(adjustmentBoxAmount({ amount: '150.00' })).toBe('150.00');
    expect(adjustmentBoxAmount({ amount: '-15.00', grossAdjustment: '-115.00' })).toBe('0.00');
    expect(sumAdjustmentBox([
      { kind: 'output', amount: '-15.00', grossAdjustment: '-115.00' },
      { kind: 'input', amount: '3.00' },
      { kind: 'input', amount: '150.00' },
    ], 'input')).toBe('153.00');
  });

  it('discloses ledger minus form and blocks filing only when the absolute difference is over $1.00', () => {
    expect(roundingDifference('26.08', '26.09')).toBe('-0.01');
    expect(roundingDifference('26.10', '26.09')).toBe('0.01');
    expect(roundingNeedsAcknowledgement('-0.01', '0.00')).toBe(false);
    expect(roundingNeedsAcknowledgement('1.00', '-1.00')).toBe(false);
    expect(roundingNeedsAcknowledgement('-1.01', '0.00')).toBe(true);
    expect(roundingNeedsAcknowledgement('0.00', '1.01')).toBe(true);
  });

  it('claims Customs GST on the earlier invoice date, or only when paid on payments and hybrid', () => {
    expect(customsClaimDate('invoice', '2026-10-20', null)).toBe('2026-10-20');
    expect(customsClaimDate('invoice', '2026-10-20', '2026-10-28')).toBe('2026-10-20');
    expect(customsClaimDate('invoice', '2026-10-20', '2026-10-05')).toBe('2026-10-05');
    expect(customsClaimDate('payments', '2026-10-20', null)).toBeNull();
    expect(customsClaimDate('payments', '2026-10-20', '2026-11-02')).toBe('2026-11-02');
    expect(customsClaimDate('hybrid', '2026-10-20', '2026-10-18')).toBe('2026-10-18');
  });
});
