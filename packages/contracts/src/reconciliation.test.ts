import { describe, expect, it } from 'vitest';
import { createReconciliationSessionRequestSchema } from './reconciliation';

describe('reconciliation contracts', () => {
  it('rejects ownership ids on session create', () => {
    expect(
      createReconciliationSessionRequestSchema.safeParse({
        bankAccountId: '11111111-1111-1111-1111-111111111111',
        statementStartDate: '2026-09-01',
        statementEndDate: '2026-09-30',
        statementOpeningBalance: '0.00',
        statementClosingBalance: '100.00',
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }).success,
    ).toBe(false);
  });
});
