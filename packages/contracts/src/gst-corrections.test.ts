import { describe, expect, it } from 'vitest';
import { createGstCorrectionRequestSchema, gstPeriodCorrectionSchema, gstPriorPeriodCorrectionDisclosureSchema } from './gst-corrections';
import { gstCalculationSnapshotSchema } from './gst-calculation';

const disclosure = {
  id: '11111111-1111-4111-8111-111111111111',
  originalTaxReturnId: '22222222-2222-4222-8222-222222222222',
  originalPeriodStart: '2026-09-01',
  originalPeriodEnd: '2026-10-31',
  sourceType: 'invoice' as const,
  sourceId: '33333333-3333-4333-8333-333333333333',
  action: 'changed' as const,
  kind: 'output' as const,
  amount: '40.00',
  reason: 'October invoice understated output GST',
};

describe('prior period GST correction contract', () => {
  it('accepts a linked correction and rejects a zero or unlinked amount', () => {
    expect(createGstCorrectionRequestSchema.safeParse({
      originalPeriodStart: '2026-09-01', originalPeriodEnd: '2026-10-31', sourceType: 'invoice',
      sourceId: disclosure.sourceId, action: 'changed', kind: 'output', amount: '40.00', reason: 'October invoice understated output GST',
    }).success).toBe(true);
    expect(createGstCorrectionRequestSchema.safeParse({
      originalPeriodStart: '2026-09-01', originalPeriodEnd: '2026-10-31', sourceType: 'invoice',
      sourceId: disclosure.sourceId, action: 'voided', kind: 'input', amount: '0.00', reason: 'October invoice understated output GST',
    }).success).toBe(false);
    expect(createGstCorrectionRequestSchema.safeParse({
      originalPeriodStart: '2026-09-01', originalPeriodEnd: '2026-10-31', sourceType: 'invoice',
      sourceId: disclosure.sourceId, action: 'added', kind: 'output', amount: '1000.00', reason: 'short',
    }).success).toBe(false);
    expect(gstPeriodCorrectionSchema.safeParse({
      ...disclosure, targetPeriodStart: '2026-11-01', targetPeriodEnd: '2026-12-31', status: 'over_limit', carryForward: 'refused',
      netDiscrepancy: '12000.00', limit: '1000.00', resolution: null, guidance: 'Amend the original return in myIR.', createdAt: '2026-11-18T00:00:00.000Z',
    }).success).toBe(true);
    expect(gstPriorPeriodCorrectionDisclosureSchema.safeParse(disclosure).success).toBe(true);
  });

  it('keeps a v3 snapshot readable with or without a correction disclosure', () => {
    const snapshot = {
      fingerprint: 'a'.repeat(64), calculatedAt: '2026-11-01T00:00:00.000Z',
      period: { from: '2026-09-01', to: '2026-10-31', basis: 'invoice' as const },
      settings: { gstRegistrationStatus: 'registered' as const, taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'invoice' as const, gstFilingFrequency: 'two_monthly' as const, gstPeriodAnchor: 10, configured: true, reviewRequired: false, warnings: [] },
      figures: { totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00' },
      sources: [], sourceIds: { journals: [], journalLines: [], invoices: [], bills: [], expenses: [], payments: [], billPayments: [], creditNotes: [], creditNoteRefunds: [] },
      sourceCounts: { journals: 0, journalLines: 0, invoices: 0, bills: 0, expenses: 0, payments: 0, billPayments: 0, creditNotes: 0, creditNoteRefunds: 0 },
      myIrBoxes: { '10': '0.00', '14': '0.00', '15': '0.00' }, mappingStatus: 'supported' as const, warnings: [], requiresReview: false, result: 'nil' as const,
    };
    expect(gstCalculationSnapshotSchema.safeParse({ version: 'gst-ledger-v2', ...snapshot }).success).toBe(true);
    expect(gstCalculationSnapshotSchema.safeParse({ version: 'gst-ledger-v3', ...snapshot, customsGst: '0.00', rounding: { output: '0.00', input: '0.00' }, roundingReviewRequired: false }).success).toBe(true);
    expect(gstCalculationSnapshotSchema.safeParse({
      version: 'gst-ledger-v3', ...snapshot, customsGst: '0.00', rounding: { output: '-0.01', input: '0.00' }, roundingReviewRequired: false,
      priorPeriodCorrections: [disclosure],
    }).success).toBe(true);
  });
});
