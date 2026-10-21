import { describe, expect, it } from 'vitest';
import { invoiceSchema } from './invoice';
import {
  convertQuoteResponseSchema,
  createQuoteRequestSchema,
  publicSharedQuoteSchema,
  quoteSchema,
  respondToQuoteRequestSchema,
  updateQuoteRequestSchema,
} from './quote';

const customerId = '44444444-4444-4444-4444-444444444444';

describe('quote contracts', () => {
  it('accepts a quote or estimate and rejects client totals and ownership ids', () => {
    const parsed = createQuoteRequestSchema.parse({
      customerId,
      kind: 'estimate',
      date: '2026-10-21',
      items: [{ description: 'Labour', quantity: '2', rate: '100' }],
    });
    expect(parsed.kind).toBe('estimate');
    expect(parsed).not.toHaveProperty('total');

    expect(createQuoteRequestSchema.safeParse({
      customerId,
      date: '2026-10-21',
      items: [{ description: 'Labour', quantity: '2', rate: '100' }],
      total: '1.00',
      organisationId: '11111111-1111-1111-1111-111111111111',
    }).success).toBe(false);
  });

  it('rejects an empty item list, an expiry before the quote date, and a percent discount outside 0–100', () => {
    expect(createQuoteRequestSchema.safeParse({
      customerId,
      date: '2026-10-21',
      items: [],
    }).success).toBe(false);
    expect(createQuoteRequestSchema.safeParse({
      customerId,
      date: '2026-10-21',
      expiryDate: '2026-10-01',
      items: [{ description: 'Labour', quantity: '1', rate: '10' }],
    }).success).toBe(false);
    const percent = createQuoteRequestSchema.safeParse({
      customerId,
      date: '2026-10-21',
      discountType: 'percent',
      discountPercent: '101',
      items: [{ description: 'Labour', quantity: '1', rate: '10' }],
    });
    expect(percent.success).toBe(false);
    expect(updateQuoteRequestSchema.safeParse({ discountType: 'percent', discountPercent: '-1' }).success).toBe(false);
  });

  it('caps the public response and requires a typed name', () => {
    expect(respondToQuoteRequestSchema.parse({
      action: 'accept',
      name: '  Alex Ngata  ',
      note: 'Please proceed',
    })).toMatchObject({ name: 'Alex Ngata', note: 'Please proceed' });
    expect(respondToQuoteRequestSchema.safeParse({ action: 'decline', name: '   ' }).success).toBe(false);
    expect(respondToQuoteRequestSchema.safeParse({ action: 'accept', name: 'A'.repeat(121) }).success).toBe(false);
    expect(respondToQuoteRequestSchema.safeParse({
      action: 'accept',
      name: 'Alex Ngata',
      note: 'n'.repeat(1001),
    }).success).toBe(false);
    expect(respondToQuoteRequestSchema.safeParse({
      action: 'accept',
      name: 'Alex\nNgata',
    }).success).toBe(false);
    expect(respondToQuoteRequestSchema.safeParse({
      action: 'accept',
      name: 'Alex Ngata',
      organisationId: customerId,
    }).success).toBe(false);
  });

  it('round-trips a quote DTO and an optional invoice source quote', () => {
    const quote = quoteSchema.parse({
      id: '33333333-3333-4333-8333-333333333333',
      quoteNumber: 'QUO-2026-0001',
      kind: 'quote',
      revision: 1,
      customerId,
      customerName: 'North Harbour Cafe',
      date: '2026-10-21',
      expiryDate: '2026-11-20',
      subtotal: '200.00',
      taxAmount: '27.00',
      taxRate: '15.00',
      taxInclusive: false,
      discountType: 'percent',
      discountPercent: '10.00',
      discount: '20.00',
      additionalCharges: '5.00',
      additionalChargesTotal: '5.00',
      total: '212.00',
      notes: null,
      terms: null,
      currency: 'NZD',
      templateName: 'classic',
      status: 'accepted',
      sentAt: null,
      publicViewedAt: null,
      respondedAt: '2026-10-22T00:00:00.000Z',
      respondedByName: 'Alex Ngata',
      responseNote: null,
      acceptedRevision: 1,
      convertedInvoiceId: null,
      convertedInvoiceNumber: null,
      items: [{
        id: '55555555-5555-4555-8555-555555555555',
        description: 'Labour',
        quantity: '2.00',
        unit: 'ea',
        rate: '100.00',
        rateUnit: 'ea',
        tax: '27.00',
        total: '200.00',
      }],
      createdAt: '2026-10-21T00:00:00.000Z',
      updatedAt: '2026-10-21T00:00:00.000Z',
    });
    expect(quote.quoteNumber).toBe('QUO-2026-0001');
    expect(invoiceSchema.parse({
      id: '66666666-6666-4666-8666-666666666666',
      invoiceNumber: 'INV-2026-0001',
      customerId,
      date: '2026-10-22',
      dueDate: '2026-11-21',
      paymentTermDays: 30,
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      discountType: quote.discountType,
      discountPercent: quote.discountPercent,
      discount: quote.discount,
      additionalCharges: quote.additionalCharges,
      total: quote.total,
      totalPaid: '0.00',
      balanceDue: quote.total,
      paymentStatus: 'unpaid',
      taxInclusive: false,
      status: 'draft',
      notes: null,
      terms: null,
      currency: 'NZD',
      customerName: 'North Harbour Cafe',
      items: quote.items,
      sourceQuoteId: quote.id,
      sourceQuoteNumber: quote.quoteNumber,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
    }).sourceQuoteNumber).toBe('QUO-2026-0001');
    expect(convertQuoteResponseSchema.shape.invoice).toBe(invoiceSchema);
    expect(publicSharedQuoteSchema.shape.status).toBeDefined();
  });
});
