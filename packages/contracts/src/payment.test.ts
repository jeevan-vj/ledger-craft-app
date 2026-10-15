import { describe, expect, it } from 'vitest';
import { createAccountRequestSchema, createPaymentRequestSchema, paymentSchema } from './payment';

describe('payment contracts', () => {
  const payment = {
    id: '88888888-8888-8888-8888-888888888888',
    invoiceId: '33333333-3333-3333-3333-333333333333',
    invoiceNumber: 'INV-2026-0001',
    paymentMethod: 'bank_transfer' as const,
    amount: '5175.00',
    paymentDate: '2026-09-08',
    referenceNumber: 'REF-1',
    notes: null,
    status: 'completed' as const,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
  };

  it('accepts a camelCase payment DTO without ownership ids', () => {
    expect(paymentSchema.parse(payment).amount).toBe('5175.00');
  });

  it('rejects ownership ids and client status on create', () => {
    expect(
      createPaymentRequestSchema.safeParse({
        invoiceId: payment.invoiceId,
        paymentMethod: 'bank_transfer',
        amount: '10.00',
        paymentDate: '2026-09-08',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
    expect(
      createPaymentRequestSchema.safeParse({
        invoiceId: payment.invoiceId,
        paymentMethod: 'bank_transfer',
        amount: '10.00',
        paymentDate: '2026-09-08',
        status: 'completed',
      }).success,
    ).toBe(false);
  });
});

describe('account contracts', () => {
  it('rejects ownership ids on account create', () => {
    expect(
      createAccountRequestSchema.safeParse({
        name: 'Sales',
        type: 'revenue',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });
});
