import { describe, expect, it } from 'vitest';
import {
  createInvoiceRequestSchema,
  updateInvoiceRequestSchema,
  createShareInvoiceRequestSchema,
  invoiceSchema,
  publicSharedInvoiceSchema,
  sendInvoiceRequestSchema,
  shareInvoiceResponseSchema,
} from './invoice';

describe('invoice contracts', () => {
  const invoice = {
    id: '33333333-3333-3333-3333-333333333333',
    invoiceNumber: 'INV-2026-0001',
    customerId: '44444444-4444-4444-4444-444444444444',
    date: '2026-09-07',
    dueDate: '2026-10-07',
    paymentTermDays: 30,
    subtotal: '4500.00',
    taxAmount: '675.00',
    discountType: 'fixed' as const,
    discountPercent: null,
    discount: null,
    additionalCharges: null,
    total: '5175.00',
    totalPaid: '0.00',
    balanceDue: '5175.00',
    paymentStatus: 'unpaid',
    taxInclusive: false,
    status: 'draft' as const,
    notes: null,
    terms: null,
    currency: 'NZD',
    customerName: 'North Harbour Cafe',
    items: [
      {
        id: '55555555-5555-5555-5555-555555555555',
        description: 'Brand identity',
        quantity: '1',
        unit: 'ea',
        rate: '4500',
        rateUnit: 'ea',
        tax: '675.00',
        total: '4500.00',
      },
    ],
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  };

  it('accepts a camelCase invoice DTO without ownership ids', () => {
    expect(invoiceSchema.parse(invoice).invoiceNumber).toBe('INV-2026-0001');
  });

  it('rejects client totals and ownership ids on create', () => {
    const result = createInvoiceRequestSchema.safeParse({
      customerId: invoice.customerId,
      date: invoice.date,
      dueDate: invoice.dueDate,
      items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
      total: '1.00',
      organisationId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('accepts payment terms and percent discount on create', () => {
    const parsed = createInvoiceRequestSchema.parse({
      customerId: invoice.customerId,
      date: invoice.date,
      dueDate: invoice.dueDate,
      paymentTermDays: 14,
      discountType: 'percent',
      discountPercent: '10',
      items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
    });
    expect(parsed.paymentTermDays).toBe(14);
    expect(parsed.discountType).toBe('percent');
    expect(parsed.discountPercent).toBe('10');
  });

  it('rejects percent discount without a percent value', () => {
    const result = createInvoiceRequestSchema.safeParse({
      customerId: invoice.customerId,
      date: invoice.date,
      dueDate: invoice.dueDate,
      discountType: 'percent',
      items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects payment terms outside 0-365', () => {
    const result = createInvoiceRequestSchema.safeParse({
      customerId: invoice.customerId,
      date: invoice.date,
      dueDate: invoice.dueDate,
      paymentTermDays: 400,
      items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts send recipients and rejects invalid emails', () => {
    expect(sendInvoiceRequestSchema.parse({ to: ['hello@nhcafe.nz'] }).to).toEqual(['hello@nhcafe.nz']);
    expect(sendInvoiceRequestSchema.safeParse({ to: ['not-an-email'] }).success).toBe(false);
  });

  it('accepts a share create body without ownership ids', () => {
    expect(
      createShareInvoiceRequestSchema.parse({
        templateName: 'classic',
        expiresAt: '2026-10-08T00:00:00.000Z',
      }).templateName,
    ).toBe('classic');
    expect(
      createShareInvoiceRequestSchema.safeParse({ organisationId: invoice.customerId }).success,
    ).toBe(false);
  });

  it('accepts a public shared invoice snapshot', () => {
    const shared = shareInvoiceResponseSchema.parse({
      shareToken: 'a1b2c3d4e5f6789012345678abcdef01',
      expiresAt: null,
      isActive: true,
    });
    expect(shared.isActive).toBe(true);
    expect(
      publicSharedInvoiceSchema.safeParse({
        invoice,
        templateName: 'classic',
        businessProfile: {
          id: '66666666-6666-6666-6666-666666666666',
          name: 'Kauri Studio Ltd',
          email: 'hello@kauristudio.nz',
          phone: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          country: 'NZ',
          taxId: null,
          logoUrl: null,
          website: null,
          defaultTaxRate: '15',
          defaultTerms: null,
          paymentTermDays: 30,
          defaultNotes: null,
          bankInfo: null,
          theme: null,
          invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
          invoiceNumberSequence: 1,
          createdAt: '2026-09-07T00:00:00.000Z',
          updatedAt: '2026-09-07T00:00:00.000Z',
        },
      }).success,
    ).toBe(true);
  });
});

it('accepts named charges and rejects invalid amounts and client-computed totals', () => {
  const charge = { id: 'delivery', type: 'delivery', label: 'Delivery', calculationType: 'fixed', amount: '30.00', isActive: true };
  expect(updateInvoiceRequestSchema.parse({ additionalChargesList: [charge] }).additionalChargesList).toEqual([charge]);
  expect(updateInvoiceRequestSchema.parse({ additionalChargesList: [] }).additionalChargesList).toEqual([]);
  for (const amount of ['-30', 'NaN', 'Infinity', '1e3', 30]) {
    expect(updateInvoiceRequestSchema.safeParse({ additionalChargesList: [{ ...charge, amount }] }).success).toBe(false);
  }
  expect(updateInvoiceRequestSchema.safeParse({ additionalChargesTotal: '1' }).success).toBe(false);
});
