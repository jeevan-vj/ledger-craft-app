import { describe, expect, it } from 'vitest';
import { gstCalculationSnapshotSchema } from './gst-calculation';

describe('auditable GST calculation snapshot', () => {
  it('requires a version, exact myIR box strings and stable SHA256 fingerprint', () => {
    expect(gstCalculationSnapshotSchema.shape.version.safeParse('gst-ledger-v2').success).toBe(true);
    expect(gstCalculationSnapshotSchema.shape.version.safeParse('browser-total').success).toBe(false);
    expect(gstCalculationSnapshotSchema.shape.fingerprint.safeParse('a'.repeat(64)).success).toBe(true);
    expect(gstCalculationSnapshotSchema.shape.fingerprint.safeParse('client-edit').success).toBe(false);
    expect(gstCalculationSnapshotSchema.shape.myIrBoxes.shape['15'].safeParse('-45.00').success).toBe(true);
    expect(gstCalculationSnapshotSchema.shape.myIrBoxes.shape['15'].safeParse(-45).success).toBe(false);
    expect(gstCalculationSnapshotSchema.shape.myIrBoxes.shape['15'].safeParse('45.001').success).toBe(false);
  });
});
