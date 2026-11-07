import { describe, expect, it } from 'vitest';
import { stripeBalanceSchema, stripeFullRefundRequestSchema, stripeVerificationSchema } from './stripe';
describe('Stripe operational DTOs', () => {
  it('requires exact signed balance text and an explicit full-refund reason', () => {
    expect(stripeBalanceSchema.safeParse({ currency: 'NZD', available: '-10.00', pending: '4.30', ledgerClearing: '0.00', difference: '-5.70', checkedAt: '2026-11-07T00:00:00.000Z', warnings: [] }).success).toBe(true);
    expect(stripeFullRefundRequestSchema.safeParse({ reason: 'Customer requested cancellation' }).success).toBe(true);
    expect(stripeFullRefundRequestSchema.safeParse({ reason: 'x', amount: '1.00' }).success).toBe(false);
    expect(stripeVerificationSchema.safeParse({ id: crypto.randomUUID(), result: 'mismatch', differences: ['amount'], checkedAt: '2026-11-07T00:00:00.000Z' }).success).toBe(true);
  });
});
