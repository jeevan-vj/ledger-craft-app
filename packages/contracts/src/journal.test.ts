import { describe, expect, it } from 'vitest';
import { createJournalEntryRequestSchema, updateJournalEntryRequestSchema } from './journal';

describe('journal contracts', () => {
  it('rejects ownership ids on journal create', () => {
    expect(
      createJournalEntryRequestSchema.safeParse({
        description: 'Rent',
        entryDate: '2026-09-11',
        debitAccountId: '11111111-1111-1111-1111-111111111111',
        creditAccountId: '22222222-2222-2222-2222-222222222222',
        amount: '100.00',
        organisationId: '33333333-3333-3333-3333-333333333333',
      }).success,
    ).toBe(false);
  });
  it('only allows draft/posted status updates; reversal needs a counter entry', () => {
    expect(updateJournalEntryRequestSchema.safeParse({ status: 'posted' }).success).toBe(true);
    expect(updateJournalEntryRequestSchema.safeParse({ status: 'reversed' }).success).toBe(false);
  });
});
