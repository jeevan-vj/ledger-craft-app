import { describe, expect, it } from 'vitest';
import { createPaymentReceiptRequestSchema } from './receipt';

describe('receipt contracts', () => {
  it('rejects ownership ids on create', () => {
    expect(
      createPaymentReceiptRequestSchema.safeParse({
        paymentId: '11111111-1111-1111-1111-111111111111',
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }).success,
    ).toBe(false);
  });
});
