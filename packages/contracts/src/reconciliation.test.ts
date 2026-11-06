import { describe, expect, it } from 'vitest';
import {
  acceptBankTransactionSuggestionRequestSchema,
  bankMatchingRuleSchema,
  bankTransactionSuggestionResponseSchema,
  createReconciliationMatchRequestSchema,
  createReconciliationSessionRequestSchema,
} from './reconciliation';

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

  it('accepts bills as statement-session book items', () => {
    expect(createReconciliationMatchRequestSchema.safeParse({
      bankTransactionId: crypto.randomUUID(),
      bookItemType: 'bill',
      bookItemId: crypto.randomUUID(),
    }).success).toBe(true);
  });

  it('keeps suggestion and allocation money as decimal strings', () => {
    const transactionId = crypto.randomUUID();
    const invoiceId = crypto.randomUUID();
    expect(bankTransactionSuggestionResponseSchema.parse({
      transactionId,
      suggestions: [{
        id: invoiceId,
        type: 'invoice',
        date: '2026-11-06',
        description: 'Invoice INV-001',
        reference: 'INV-001',
        counterparty: 'ACME',
        amount: '100.00',
        score: 100,
        reasons: ['Exact amount match', 'Reference match'],
        matchingRuleId: null,
        targetAccountId: null,
        contactId: null,
      }],
    }).suggestions[0]?.amount).toBe('100.00');
    expect(acceptBankTransactionSuggestionRequestSchema.safeParse({
      allocations: [{ documentType: 'invoice', documentId: invoiceId, amount: 100 }],
    }).success).toBe(false);
  });

  it('validates matching-rule response fields', () => {
    expect(bankMatchingRuleSchema.safeParse({
      id: crypto.randomUUID(),
      descriptionContains: 'ACME Fuel',
      amountMin: '10.00',
      amountMax: '200.00',
      direction: 'debit',
      targetAccountId: crypto.randomUUID(),
      contactId: null,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).success).toBe(true);
  });
});
