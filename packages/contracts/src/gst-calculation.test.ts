import { describe, expect, it } from 'vitest';
import { gstCalculationSnapshotSchema, gstCalculationSnapshotV2Schema } from './gst-calculation';

const snapshot = {
  fingerprint: 'a'.repeat(64), calculatedAt: '2026-11-01T00:00:00.000Z',
  period: { from: '2026-09-01', to: '2026-10-31', basis: 'invoice' as const },
  settings: { gstRegistrationStatus: 'registered' as const, taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'invoice' as const, gstFilingFrequency: 'two_monthly' as const, gstPeriodAnchor: 10, configured: true, reviewRequired: false, warnings: [] },
  figures: { totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00' },
  sources: [], sourceIds: { journals: [], journalLines: [], invoices: [], bills: [], expenses: [], payments: [], billPayments: [], creditNotes: [], creditNoteRefunds: [] },
  sourceCounts: { journals: 0, journalLines: 0, invoices: 0, bills: 0, expenses: 0, payments: 0, billPayments: 0, creditNotes: 0, creditNoteRefunds: 0 },
  myIrBoxes: { '10': '0.00', '14': '0.00', '15': '0.00' }, mappingStatus: 'supported' as const, warnings: [], requiresReview: false, result: 'nil' as const,
};

describe('auditable GST calculation snapshot', () => {
  it('reads a v2 snapshot and a v3 snapshot with disclosed rounding', () => {
    expect(gstCalculationSnapshotSchema.safeParse({ version: 'gst-ledger-v2', ...snapshot }).success).toBe(true);
    expect(gstCalculationSnapshotSchema.safeParse({ version: 'gst-ledger-v3', ...snapshot, customsGst: '150.00', rounding: { output: '-0.01', input: '0.00' }, roundingReviewRequired: false }).success).toBe(true);
    expect(gstCalculationSnapshotSchema.safeParse({ version: 'browser-total', ...snapshot }).success).toBe(false);
    expect(gstCalculationSnapshotV2Schema.shape.fingerprint.safeParse('a'.repeat(64)).success).toBe(true);
    expect(gstCalculationSnapshotV2Schema.shape.fingerprint.safeParse('client-edit').success).toBe(false);
    expect(gstCalculationSnapshotV2Schema.shape.myIrBoxes.shape['15'].safeParse('-45.00').success).toBe(true);
    expect(gstCalculationSnapshotV2Schema.shape.myIrBoxes.shape['15'].safeParse(-45).success).toBe(false);
    expect(gstCalculationSnapshotV2Schema.shape.myIrBoxes.shape['15'].safeParse('45.001').success).toBe(false);
  });
});
