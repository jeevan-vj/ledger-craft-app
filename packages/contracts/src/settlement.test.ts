import { describe, expect, it } from 'vitest';
import { createPaymentRequestSchema, recordBillPaymentRequestSchema, createReconciliationMatchRequestSchema, reconciliationMatchSchema } from './index';

const id = '00000000-0000-4000-8000-000000000001';
describe('reviewed foreign settlements and supplier-payment matching contracts', () => {
  it('accepts an explicitly reviewed settlement rate for both receivables and payables', () => {
    expect(createPaymentRequestSchema.safeParse({ invoiceId: id, amount: '100', paymentMethod: 'bank_transfer', paymentDate: '2026-10-20', exchangeRateId: id }).success).toBe(true);
    expect(recordBillPaymentRequestSchema.safeParse({ bankAccountId: id, amount: '100', paymentDate: '2026-10-20', exchangeRateId: id }).success).toBe(true);
  });
  it('uses the actual supplier-payment identity instead of the parent bill', () => {
    expect(createReconciliationMatchRequestSchema.safeParse({ bankTransactionId: id, bookItemId: id, bookItemType: 'bill_payment', status: 'confirmed' }).success).toBe(true);
    expect(reconciliationMatchSchema.shape.billPaymentId).toBeDefined();
  });
});
