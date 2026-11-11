import { describe, expect, it } from 'vitest';
import { gstPreparationQuerySchema, gstAdjustmentPreparationRequestSchema, companyIncomeTaxPreparationRequestSchema } from './gst-preparation';

describe('completed tax preparation contracts', () => {
  it('supports explicitly selected payments basis without accepting caller ownership', () => {
    expect(gstPreparationQuerySchema.parse({ from: '2026-04-01', to: '2026-04-30', basis: 'payments' }).basis).toBe('payments');
    expect(gstPreparationQuerySchema.safeParse({ from: '2026-04-01', to: '2026-04-30', organisationId: 'foreign' }).success).toBe(false);
  });
  it('requires review and documentary reasons for signed GST adjustments', () => {
    const request = { from: '2026-04-01', to: '2026-04-30', basis: 'invoice', reviewConfirmed: true, adjustments: [{ kind: 'output', amount: '-15.00', grossAdjustment: '-115.00', reason: 'Credit note for returned service', sourceReference: 'CN-0001' }] };
    expect(gstAdjustmentPreparationRequestSchema.parse(request)).toEqual(request);
    expect(gstAdjustmentPreparationRequestSchema.safeParse({ ...request, reviewConfirmed: false }).success).toBe(false);
    expect(gstAdjustmentPreparationRequestSchema.safeParse({ ...request, adjustments: [{ ...request.adjustments[0], reason: '' }] }).success).toBe(false);
    expect(gstAdjustmentPreparationRequestSchema.safeParse({ ...request, adjustments: [{ ...request.adjustments[0], amount: '1.234' }] }).success).toBe(false);
    const typed = { kind: 'input' as const, type: 'customs_gst' as const, amount: '150.00', reason: 'Import GST on the customs assessment', sourceReference: 'CUS-100' };
    expect(gstAdjustmentPreparationRequestSchema.parse({ ...request, adjustments: [typed] }).adjustments).toEqual([typed]);
    expect(gstAdjustmentPreparationRequestSchema.safeParse({ ...request, adjustments: [{ ...typed, type: 'other' }] }).success).toBe(false);
    expect(gstAdjustmentPreparationRequestSchema.safeParse({ ...request, adjustments: [{ ...typed, type: 'other', note: 'No listed category fits this credit' }] }).success).toBe(true);
    expect(gstAdjustmentPreparationRequestSchema.safeParse({ ...request, adjustments: [{ ...typed, type: 'private_use_output' }] }).success).toBe(false);
    expect(gstAdjustmentPreparationRequestSchema.safeParse({ ...request, adjustments: [{ kind: 'output', type: 'prior_period_correction', amount: '12000.00', reason: 'Prior period difference found after filing', sourceReference: 'PP-1' }] }).success).toBe(true);
  });
  it('requires explicit standard NZ-company eligibility and confirmed tax rate', () => {
    const request = { from: '2026-04-01', to: '2027-03-31', entityType: 'nz_company', taxRate: '28', rateConfirmed: true, adjustments: [], lossesBroughtForward: '0.00', taxCredits: '0.00' };
    expect(companyIncomeTaxPreparationRequestSchema.parse(request)).toEqual(request);
    expect(companyIncomeTaxPreparationRequestSchema.safeParse({ ...request, rateConfirmed: false }).success).toBe(false);
    expect(companyIncomeTaxPreparationRequestSchema.safeParse({ ...request, entityType: 'sole_trader' }).success).toBe(false);
    expect(companyIncomeTaxPreparationRequestSchema.safeParse({ ...request, taxRate: '150' }).success).toBe(false);
  });
});
