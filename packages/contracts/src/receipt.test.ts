import { describe, expect, it } from 'vitest';
import { createPaymentReceiptRequestSchema, paymentReceiptSchema } from './receipt';

describe('receipt contracts', () => {
  it('rejects ownership ids on create', () => {
    expect(
      createPaymentReceiptRequestSchema.safeParse({
        paymentId: '11111111-1111-1111-1111-111111111111',
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }).success,
    ).toBe(false);
  });

  it('returns the immutable payment snapshot needed to render a receipt', () => {
    const receipt = paymentReceiptSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      paymentId: '22222222-2222-2222-2222-222222222222',
      receiptNumber: 'REC-202610-0001',
      generatedAt: '2026-10-19T00:00:00.000Z',
      emailSentAt: null,
      isEmailed: false,
      receiptData: {
        paymentId: '22222222-2222-2222-2222-222222222222',
        invoiceId: '33333333-3333-3333-3333-333333333333',
        invoiceNumber: 'INV-2026-001',
        customerName: 'Kauri Studio',
        customerEmail: 'accounts@kauri.example',
        amountPaid: '115.00',
        paymentDate: '2026-10-19',
        invoiceDate: '2026-10-01',
        invoiceDueDate: '2026-10-31',
        paymentMethod: 'bank_transfer',
        currency: 'NZD',
        invoiceTotal: '230.00',
        totalPaid: '115.00',
        balanceDue: '115.00',
      },
      createdAt: '2026-10-19T00:00:00.000Z',
    });

    expect(receipt.receiptData.amountPaid).toBe('115.00');
    expect(receipt.receiptData.customerName).toBe('Kauri Studio');
    expect(receipt.receiptData.invoiceDueDate).toBe('2026-10-31');
  });
});
