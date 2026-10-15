import { describe, expect, it } from 'vitest';
import {
  billSchema,
  createBillRequestSchema,
  createVendorRequestSchema,
  recordBillPaymentRequestSchema,
} from './purchase';

describe('purchase contracts', () => {
  it('accepts vendor writes without ownership fields', () => {
    expect(createVendorRequestSchema.parse({
      name: 'Harbour Office Supplies',
      email: 'accounts@harbour.example',
      paymentTermDays: 20,
    })).toMatchObject({ name: 'Harbour Office Supplies', paymentTermDays: 20 });

    expect(createVendorRequestSchema.safeParse({
      name: 'Sneaky supplier',
      organisationId: '11111111-1111-1111-1111-111111111111',
    }).success).toBe(false);
  });

  it('accepts a draft bill and rejects client-calculated totals', () => {
    const input = {
      vendorId: '77777777-7777-7777-7777-777777777777',
      vendorReference: 'HS-1042',
      issueDate: '2026-10-03',
      dueDate: '2026-10-23',
      taxInclusive: true,
      lines: [{
        description: 'Printer paper',
        quantity: '2',
        unitPrice: '11.50',
        taxRate: '15',
        accountId: null,
      }],
    };
    expect(createBillRequestSchema.parse(input).lines).toHaveLength(1);
    expect(createBillRequestSchema.safeParse({ ...input, total: '1.00' }).success).toBe(false);
  });

  it('represents lifecycle and payment state separately', () => {
    const parsed = billSchema.parse({
      id: '88888888-8888-8888-8888-888888888888',
      billNumber: 'BILL-0001',
      vendorId: '77777777-7777-7777-7777-777777777777',
      vendorName: 'Harbour Office Supplies',
      vendorReference: 'HS-1042',
      issueDate: '2026-10-03',
      dueDate: '2026-10-23',
      lifecycleStatus: 'received',
      paymentStatus: 'partial',
      displayStatus: 'partial',
      currency: 'NZD',
      taxInclusive: true,
      subtotal: '20.00',
      taxAmount: '3.00',
      total: '23.00',
      totalPaid: '5.00',
      balanceDue: '18.00',
      notes: null,
      lines: [{
        id: '99999999-9999-9999-9999-999999999999',
        description: 'Printer paper',
        quantity: '2.00',
        unitPrice: '11.50',
        taxRate: '15.00',
        subtotal: '20.00',
        taxAmount: '3.00',
        total: '23.00',
        accountId: '66666666-6666-6666-6666-666666666666',
        accountName: 'Office expenses',
      }],
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    });
    expect(parsed.balanceDue).toBe('18.00');
  });

  it('requires a positive payment and bank account', () => {
    const request = {
      bankAccountId: '55555555-5555-5555-5555-555555555555',
      amount: '5.00',
      paymentDate: '2026-10-04',
    };
    expect(recordBillPaymentRequestSchema.parse(request)).toEqual(request);
    expect(recordBillPaymentRequestSchema.safeParse({ ...request, amount: '0' }).success).toBe(false);
  });
});
