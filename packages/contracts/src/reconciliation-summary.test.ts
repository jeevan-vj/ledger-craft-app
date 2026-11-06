import { describe, expect, it } from 'vitest';
import { reconciliationSummarySchema, createReconciliationSessionRequestSchema } from './index';

describe('authoritative reconciliation summary contract', () => {
  it('keeps signed cent values exact and rejects client numeric ledger balances', () => {
    expect(reconciliationSummarySchema.shape.bookBalance.safeParse('-69.00').success).toBe(true);
    expect(reconciliationSummarySchema.shape.bookBalance.safeParse(-69).success).toBe(false);
    expect(reconciliationSummarySchema.shape.bookBalance.safeParse('-69.001').success).toBe(false);
  });
  it('rejects invalid statement periods and sub-cent declared balances', () => {
    const input = { bankAccountId: crypto.randomUUID(), statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0', statementClosingBalance: '-69' };
    expect(createReconciliationSessionRequestSchema.safeParse(input).success).toBe(true);
    expect(createReconciliationSessionRequestSchema.safeParse({ ...input, statementStartDate: '2026-02-30' }).success).toBe(false);
    expect(createReconciliationSessionRequestSchema.safeParse({ ...input, statementStartDate: '2026-11-01' }).success).toBe(false);
    expect(createReconciliationSessionRequestSchema.safeParse({ ...input, statementClosingBalance: '-69.001' }).success).toBe(false);
  });
});
