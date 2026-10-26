import { describe, expect, it } from 'vitest';
import { chatCompletionRequestSchema, receiptScanResultSchema, scanReceiptRequestSchema } from './ai';

describe('ai contracts', () => {
  it('accepts a Workers AI receipt result provider', () => {
    expect(receiptScanResultSchema.parse({
      merchantName: 'Kiwi Supplies Ltd', date: null, total: 11.5, tax: 1.5, subtotal: 10,
      items: [], paymentMethod: 'card', suggestedCategory: 'Office Supplies', confidence: 60,
      notes: null, provider: 'workers-ai',
    }).provider).toBe('workers-ai');
  });

  it('rejects ownership ids on receipt scan', () => {
    expect(
      scanReceiptRequestSchema.safeParse({
        imageBase64: 'abc',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('rejects ownership ids on chat completion', () => {
    expect(
      chatCompletionRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'Hello' }],
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });
});
