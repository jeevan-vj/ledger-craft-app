import { describe, expect, it } from 'vitest';
import { createBankAccountRequestSchema, importBankTransactionsRequestSchema } from './bank';

describe('bank contracts', () => {
  it('rejects ownership ids on bank account create', () => {
    expect(
      createBankAccountRequestSchema.safeParse({
        accountName: 'Business cheque',
        accountNumber: '12-3456-7890123-00',
        bankName: 'ANZ',
        accountType: 'checking',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('accepts a parsed CSV import payload', () => {
    expect(
      importBankTransactionsRequestSchema.safeParse({
        bankAccountId: '11111111-1111-1111-1111-111111111111',
        transactions: [
          {
            transactionDate: '2026-09-01',
            description: 'Adobe',
            amount: '79.00',
            type: 'debit',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
