import { describe, expect, it } from 'vitest';
import { invoiceSchema } from './invoice';
import { paymentSchema } from './payment';
import { paymentReceiptSchema } from './receipt';
import {
  createSaleRequestSchema,
  saleResponseSchema,
  salesSummaryQuerySchema,
  salesSummarySchema,
} from './sale';

const invoiceId = '33333333-3333-4333-8333-333333333333';
const paymentId = '88888888-8888-4888-8888-888888888888';
const receiptId = '99999999-9999-4999-8999-999999999999';
const customerId = '22222222-2222-4222-8222-222222222222';
const itemId = '11111111-1111-4111-8111-111111111111';

const invoice = {
  id: invoiceId,
  invoiceNumber: 'INV-2026-0001',
  customerId,
  date: '2026-10-27',
  dueDate: '2026-10-27',
  paymentTermDays: 0,
  subtotal: '11.74',
  taxAmount: '1.76',
  discountType: 'fixed' as const,
  discountPercent: null,
  discount: null,
  additionalCharges: null,
  total: '13.50',
  totalPaid: '13.50',
  balanceDue: '0.00',
  paymentStatus: 'paid',
  taxInclusive: true,
  status: 'paid' as const,
  notes: null,
  terms: null,
  currency: 'NZD',
  customerName: 'Walk-in customer',
  items: [{
    id: '44444444-4444-4444-8444-444444444444',
    description: 'Pie',
    quantity: '3.00',
    unit: 'ea',
    rate: '4.50',
    rateUnit: 'ea',
    tax: '1.76',
    total: '13.50',
    discountType: 'fixed' as const,
    discountValue: null,
    discountAmount: '0.00',
    taxes: [],
  }],
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
};

const payment = {
  id: paymentId,
  invoiceId,
  invoiceNumber: 'INV-2026-0001',
  paymentMethod: 'cash' as const,
  amount: '13.50',
  paymentDate: '2026-10-27',
  referenceNumber: null,
  notes: null,
  status: 'completed' as const,
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
};

const receipt = {
  id: receiptId,
  paymentId,
  receiptNumber: 'REC-202610-0001',
  generatedAt: '2026-10-27T00:00:00.000Z',
  emailSentAt: null,
  isEmailed: false,
  receiptData: {
    paymentId,
    invoiceId,
    invoiceNumber: 'INV-2026-0001',
    customerName: 'Walk-in customer',
    customerEmail: null,
    amountPaid: '13.50',
    paymentDate: '2026-10-27',
    invoiceDate: '2026-10-27',
    invoiceDueDate: '2026-10-27',
    paymentMethod: 'cash' as const,
    currency: 'NZD',
    invoiceTotal: '13.50',
    totalPaid: '13.50',
    balanceDue: '0.00',
  },
  createdAt: '2026-10-27T00:00:00.000Z',
};

describe('sale contracts', () => {
  it('accepts a catalog line, a custom amount, and the three quick-sale methods', () => {
    const parsed = createSaleRequestSchema.parse({
      lines: [
        { itemId, quantity: '3', price: '4.50' },
        { quantity: '1', price: '0.10' },
        { label: 'Scone', quantity: '2', price: '4.50' },
      ],
      paymentMethod: 'credit_card',
      customerId,
      referenceNumber: 'EFT-1',
    });
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.paymentMethod).toBe('credit_card');
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '1', price: '9.00' }], paymentMethod: 'cash' }).success).toBe(true);
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '1', price: '9.00' }], paymentMethod: 'bank_transfer' }).success).toBe(true);
    expect(createSaleRequestSchema.safeParse({
      lines: Array.from({ length: 100 }, () => ({ quantity: '1', price: '4.50' })),
      paymentMethod: 'cash',
    }).success).toBe(true);
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '1', price: '4.5' }], paymentMethod: 'cash' }).success).toBe(true);
  });

  it('rejects other payment methods, empty carts, non-positive amounts, and ownership ids', () => {
    const line = { quantity: '1', price: '4.50' };
    expect(createSaleRequestSchema.safeParse({ lines: [line], paymentMethod: 'cheque' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [line], paymentMethod: 'online' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [line], paymentMethod: 'eftpos' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [], paymentMethod: 'cash' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '0', price: '4.50' }], paymentMethod: 'cash' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '-1', price: '4.50' }], paymentMethod: 'cash' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '1', price: '0' }], paymentMethod: 'cash' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '1', price: '-4.50' }], paymentMethod: 'cash' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '1', price: '4.501' }], paymentMethod: 'cash' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({ lines: [{ quantity: '1.001', price: '4.50' }], paymentMethod: 'cash' }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({
      lines: Array.from({ length: 101 }, () => line),
      paymentMethod: 'cash',
    }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({
      lines: [line],
      paymentMethod: 'cash',
      organisationId: '11111111-1111-4111-8111-111111111111',
    }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({
      lines: [{ itemId, label: 'Pie', quantity: '1', price: '4.50' }],
      paymentMethod: 'cash',
    }).success).toBe(false);
    expect(createSaleRequestSchema.safeParse({
      lines: [line],
      paymentMethod: 'cash',
      total: '4.50',
      taxAmount: '0.59',
    }).success).toBe(false);
  });

  it('parses a sale response of invoice, payment, and receipt', () => {
    expect(invoiceSchema.parse(invoice).total).toBe('13.50');
    expect(paymentSchema.parse(payment).status).toBe('completed');
    expect(paymentReceiptSchema.parse(receipt).receiptData.customerEmail).toBeNull();
    const sale = saleResponseSchema.parse({ invoice, payment, receipt });
    expect(sale.invoice.balanceDue).toBe('0.00');
    expect(sale.payment.amount).toBe(sale.invoice.total);
    expect(sale.receipt.paymentId).toBe(sale.payment.id);
  });

  it('parses a day summary of exact decimal strings and invoice ids', () => {
    const summary = salesSummarySchema.parse({
      date: '2026-10-27',
      count: 2,
      grossTotal: '31.50',
      gstTotal: '4.11',
      paymentMethods: [
        { paymentMethod: 'cash', total: '13.50' },
        { paymentMethod: 'credit_card', total: '18.00' },
      ],
      topItemsByQuantity: [{ description: 'Pie', quantity: '5.00', amount: '22.50' }],
      topItemsByAmount: [{ description: 'Pie', quantity: '5.00', amount: '22.50' }],
      sales: [
        { invoiceId, invoiceNumber: 'INV-2026-0001', total: '13.50', taxAmount: '1.76' },
        { invoiceId: paymentId, invoiceNumber: 'INV-2026-0002', total: '18.00', taxAmount: '2.35' },
      ],
    });
    expect(summary.count).toBe(2);
    expect(summary.sales.map((sale) => sale.invoiceId)).toEqual([invoiceId, paymentId]);
    expect(summary.grossTotal).toBe('31.50');
    expect(summary.gstTotal).toBe('4.11');
  });

  it('rejects numeric amounts, a missing date, and a date that is not a real calendar day', () => {
    expect(salesSummarySchema.safeParse({
      date: '2026-10-27',
      count: 0,
      grossTotal: 0,
      gstTotal: '0.00',
      paymentMethods: [],
      topItemsByQuantity: [],
      topItemsByAmount: [],
      sales: [],
    }).success).toBe(false);
    expect(salesSummaryQuerySchema.safeParse({}).success).toBe(false);
    expect(salesSummaryQuerySchema.safeParse({ date: '2026-02-31' }).success).toBe(false);
    expect(salesSummaryQuerySchema.safeParse({ date: '27-10-2026' }).success).toBe(false);
    expect(salesSummaryQuerySchema.safeParse({ date: '2026-10-27' }).success).toBe(true);
  });
});
