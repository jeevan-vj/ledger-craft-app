import { describe, expect, it } from 'vitest';
import { openingBalancesRequestSchema, applyLedgerAuditRequestSchema } from './accounting-recovery';

describe('accounting recovery requests', () => {
  it('requires explicit review and valid balanced-shape opening lines', () => {
    const input = { date: '2026-04-01', reference: 'Migration opening', reviewed: true, lines: [
      { accountId: 'bank', debit: '5000.00', credit: '0.00' }, { accountId: 'capital', debit: '0.00', credit: '5000.00' },
    ] };
    expect(openingBalancesRequestSchema.parse(input)).toEqual(input);
    expect(openingBalancesRequestSchema.safeParse({ ...input, reviewed: false }).success).toBe(false);
    expect(openingBalancesRequestSchema.safeParse({ ...input, date: '2026-02-30' }).success).toBe(false);
    expect(openingBalancesRequestSchema.safeParse({ ...input, lines: [{ accountId: 'bank', debit: '1e3', credit: '0' }] }).success).toBe(false);
    expect(openingBalancesRequestSchema.safeParse({ ...input, organisationId: 'untrusted' }).success).toBe(false);
  });
  it('binds reviewed audit selections to evidence fingerprints', () => {
    const input = { date: '2026-04-01', reason: 'Accountant approved correction', reviewed: true, findings: [{ key: 'expense-gst:source', fingerprint: 'a'.repeat(64) }] };
    expect(applyLedgerAuditRequestSchema.parse(input)).toEqual(input);
    expect(applyLedgerAuditRequestSchema.safeParse({ ...input, findings: [{ key: 'source' }] }).success).toBe(false);
    expect(applyLedgerAuditRequestSchema.safeParse({ ...input, reason: '' }).success).toBe(false);
  });
});
