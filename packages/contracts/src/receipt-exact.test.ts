import { describe, expect, it } from 'vitest';
import { receiptScanResultSchema } from './ai';
describe('reviewed receipt proposals', () => {
  it('retains exact decimal money strings and rejects numerical money', () => {
    const input = { merchantName: 'Supplier', date: '2026-10-01', total: '123456789.01', tax: '16016.13', subtotal: '123440772.88', items: [{ description: 'Supplies', quantity: '1', price: '123456789.01' }], paymentMethod: 'card', suggestedCategory: null, confidence: 60, notes: null };
    expect(receiptScanResultSchema.parse(input).total).toBe('123456789.01');
    expect(receiptScanResultSchema.safeParse({ ...input, total: 123456789.01 }).success).toBe(false);
  });
});
