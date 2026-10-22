import { describe, expect, it } from 'vitest';
import {
  bankTransactionDetailsRequestSchema,
  createBankAccountRequestSchema,
  createBankTransactionRequestSchema,
  createBankTransferRequestSchema,
  duplicateBankTransactionRequestSchema,
  importBankTransactionsRequestSchema,
  updateBankTransactionRequestSchema,
} from './bank';

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

  it('accepts exact manual transaction input and rejects non-positive amounts', () => {
    const input = {
      bankAccountId: '11111111-1111-1111-1111-111111111111',
      transactionDate: '2026-10-19',
      description: 'Owner contribution',
      amount: '9007199254740993.01',
      type: 'credit' as const,
      category: 'Capital introduced',
      counterparty: 'Jeevan',
      paymentMethod: 'bank_transfer' as const,
    };

    expect(createBankTransactionRequestSchema.safeParse(input).success).toBe(true);
    expect(createBankTransactionRequestSchema.safeParse({ ...input, amount: '0.00' }).success).toBe(false);
    expect(createBankTransactionRequestSchema.safeParse({ ...input, organisationId: input.bankAccountId }).success).toBe(false);
    expect(updateBankTransactionRequestSchema.safeParse({ description: 'Updated', notes: null }).success).toBe(true);
  });

  it('accepts a same-currency transfer request and rejects invalid transfer amounts', () => {
    const input = {
      sourceAccountId: '11111111-1111-1111-1111-111111111111',
      destinationAccountId: '22222222-2222-2222-2222-222222222222',
      transactionDate: '2026-10-19',
      amount: '10.01',
      description: 'Move to savings',
      reference: 'TRANSFER-001',
    };

    expect(createBankTransferRequestSchema.safeParse(input).success).toBe(true);
    expect(createBankTransferRequestSchema.safeParse({ ...input, amount: '-1.00' }).success).toBe(false);
    expect(createBankTransferRequestSchema.safeParse({ ...input, extra: true }).success).toBe(false);
  });

  it('validates exact split, document connection, attachment and duplicate inputs', () => {
    const details = bankTransactionDetailsRequestSchema.parse({
      splits: [
        { category: 'Software', description: 'Subscription', amount: '40.00' },
        { category: 'Equipment', description: null, amount: '60.00' },
      ],
      documentConnections: [{ documentType: 'bill', documentId: crypto.randomUUID(), amount: '75.00' }],
      attachments: [{
        objectKey: `${crypto.randomUUID()}/bank_attachment/receipt.pdf`,
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
        size: 512,
      }],
    });
    expect(details.splits).toHaveLength(2);
    expect(bankTransactionDetailsRequestSchema.safeParse({
      splits: [{ category: 'Software', amount: '-1.00' }],
      documentConnections: [],
      attachments: [],
    }).success).toBe(false);
    expect(duplicateBankTransactionRequestSchema.parse({ transactionDate: '2026-10-23' })).toEqual({ transactionDate: '2026-10-23' });
  });
});
