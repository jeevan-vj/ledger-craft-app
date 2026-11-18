import { describe, expect, it } from 'vitest';
import { assessGstCorrections, gstCorrectionCarryLimit, gstCorrectionWithinLimit, netGstDiscrepancy } from './gst-correction-limit';

const row = (id: string, kind: 'output' | 'input', amount: string, original = 'period-a') => ({ id, originalTaxReturnId: original, kind, amount });

describe('IRD carry-forward limit for a GST correction', () => {
  it('allows exactly $1,000 even when 2% of output tax is lower', () => {
    expect(gstCorrectionCarryLimit('10000.00')).toBe('1000.00');
    expect(gstCorrectionWithinLimit('1000.00', '10000.00')).toBe(true);
    expect(gstCorrectionWithinLimit('1000.01', '10000.00')).toBe(false);
    expect(gstCorrectionWithinLimit('-1000.00', '0.00')).toBe(true);
    expect(gstCorrectionWithinLimit('-1000.01', '0.00')).toBe(false);
  });

  it('uses 2% of output tax when that is above $1,000 and below the $10,000 cap', () => {
    expect(gstCorrectionCarryLimit('200000.00')).toBe('4000.00');
    expect(gstCorrectionWithinLimit('4000.00', '200000.00')).toBe(true);
    expect(gstCorrectionWithinLimit('4000.01', '200000.00')).toBe(false);
    expect(gstCorrectionWithinLimit('1000.00', '200000.00')).toBe(true);
  });

  it('caps the 2% limb at $10,000', () => {
    expect(gstCorrectionCarryLimit('600000.00')).toBe('10000.00');
    expect(gstCorrectionWithinLimit('10000.00', '600000.00')).toBe(true);
    expect(gstCorrectionWithinLimit('10000.01', '600000.00')).toBe(false);
    expect(gstCorrectionWithinLimit('12000.00', '600000.00')).toBe(false);
    expect(gstCorrectionWithinLimit('12000.00', '0.00')).toBe(false);
  });

  it('keeps a negative output tax on the $1,000 safe harbour', () => {
    expect(gstCorrectionCarryLimit('-200000.00')).toBe('1000.00');
    expect(gstCorrectionCarryLimit('0.00')).toBe('1000.00');
    expect(gstCorrectionWithinLimit('1000.00', '-200000.00')).toBe(true);
    expect(gstCorrectionWithinLimit('1000.01', '-200000.00')).toBe(false);
    expect(gstCorrectionWithinLimit('4000.00', '-200000.00')).toBe(false);
  });

  it('rounds 2% of output tax to cents before the comparison', () => {
    expect(gstCorrectionCarryLimit('150000.25')).toBe('3000.01');
    expect(gstCorrectionWithinLimit('3000.01', '150000.25')).toBe(true);
    expect(gstCorrectionWithinLimit('3000.02', '150000.25')).toBe(false);
    expect(gstCorrectionCarryLimit('50000.50')).toBe('1000.01');
    expect(gstCorrectionWithinLimit('1000.01', '50000.50')).toBe(true);
    expect(gstCorrectionWithinLimit('1000.02', '50000.50')).toBe(false);
  });

  it('nets output and input corrections from the same original return', () => {
    expect(netGstDiscrepancy([
      { kind: 'output', amount: '600.00' },
      { kind: 'input', amount: '500.00' },
    ])).toBe('100.00');
    expect(netGstDiscrepancy([
      { kind: 'output', amount: '40.00' },
      { kind: 'output', amount: '-15.50' },
      { kind: 'input', amount: '-10.00' },
    ])).toBe('34.50');
    const assessed = assessGstCorrections([
      row('small', 'output', '40.00', 'sep'),
      row('large', 'output', '12000.00', 'jul'),
      row('offset-out', 'output', '700.00', 'may'),
      row('offset-in', 'input', '200.00', 'may'),
    ], '10000.00');
    expect(assessed.included.map((item) => item.id).sort()).toEqual(['offset-in', 'offset-out', 'small']);
    expect(assessed.refused.map((item) => item.id)).toEqual(['large']);
    expect(assessed.blocked).toBe(true);
  });

  it('caps the combined net of every correction on the including return', () => {
    expect(gstCorrectionCarryLimit('500000.00')).toBe('10000.00');
    const twoPeriods = assessGstCorrections([
      row('first', 'output', '9000.00', 'jul'),
      row('second', 'output', '9000.00', 'sep'),
    ], '500000.00');
    expect(twoPeriods.included.map((item) => item.id)).toEqual(['first']);
    expect(twoPeriods.refused.map((item) => item.id)).toEqual(['second']);
    expect(twoPeriods.refused[0]?.assessment.guidance).toMatch(/myIR/);
    const exact = assessGstCorrections([
      row('six', 'output', '6000.00', 'jul'),
      row('four', 'output', '4000.00', 'sep'),
    ], '500000.00');
    expect(exact.included.map((item) => item.id)).toEqual(['six', 'four']);
    expect(exact.blocked).toBe(false);
    expect(exact.included[1]?.assessment.netDiscrepancy).toBe('10000.00');
    const over = assessGstCorrections([
      row('six-again', 'output', '6000.00', 'jul'),
      row('four-plus', 'output', '4000.01', 'sep'),
    ], '500000.00');
    expect(over.included.map((item) => item.id)).toEqual(['six-again']);
    expect(over.refused.map((item) => item.id)).toEqual(['four-plus']);
    expect(over.refused[0]?.assessment.netDiscrepancy).toBe('10000.01');
    expect(over.blocked).toBe(true);
  });
});
