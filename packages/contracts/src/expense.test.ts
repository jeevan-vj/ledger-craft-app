import { describe, expect, it } from 'vitest';
import { createExpenseRequestSchema, expenseSchema } from './expense';

describe('expense contracts', () => {
  const expense = {
    id: '77777777-7777-7777-7777-777777777777',
    description: 'Adobe CC',
    amount: '79.00',
    taxAmount: '10.30',
    currency: 'NZD',
    exchangeRate: '1',
    exchangeRateId: null,
    baseCurrency: 'NZD',
    baseAmount: '79.00',
    baseTaxAmount: '10.30',
    expenseDate: '2026-09-08',
    status: 'pending' as const,
    isBillable: false,
    categoryId: null,
    categoryName: null,
    accountId: null,
    accountName: null,
    customerId: null,
    customerName: null,
    vendorName: 'Adobe',
    receiptUrl: null,
    paymentMethod: 'card' as const,
    notes: null,
    gstTreatment: 'partial' as const,
    gstExemptionReason: 'entertainment_50' as const,
    gstClaimablePercentage: 50,
    privateUsePercentage: 10,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
  };

  it('accepts a camelCase expense DTO without ownership ids', () => {
    expect(expenseSchema.parse(expense)).toMatchObject({
      amount: '79.00',
      gstTreatment: 'partial',
      gstExemptionReason: 'entertainment_50',
      gstClaimablePercentage: 50,
      privateUsePercentage: 10,
    });
  });

  it('accepts NZ GST treatment fields on create', () => {
    expect(
      createExpenseRequestSchema.parse({
        description: 'Client lunch',
        amount: '115.00',
        expenseDate: '2026-10-02',
        gstTreatment: 'partial',
        gstExemptionReason: 'entertainment_50',
        gstClaimablePercentage: 50,
        privateUsePercentage: 0,
      }),
    ).toMatchObject({
      gstTreatment: 'partial',
      gstExemptionReason: 'entertainment_50',
      gstClaimablePercentage: 50,
      privateUsePercentage: 0,
    });
  });

  it('rejects ownership ids and negative amounts on create', () => {
    expect(
      createExpenseRequestSchema.safeParse({
        description: 'Adobe CC',
        amount: '-1',
        expenseDate: '2026-09-08',
      }).success,
    ).toBe(false);
    expect(
      createExpenseRequestSchema.safeParse({
        description: 'Adobe CC',
        amount: '79.00',
        expenseDate: '2026-09-08',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });
});
