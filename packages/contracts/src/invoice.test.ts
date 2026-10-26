import { describe, expect, it } from 'vitest';
import {
  createInvoiceRequestSchema,
  importInvoicesRequestSchema,
  invoiceAttachmentSchema,
  invoiceLifecycleActionRequestSchema,
  updateInvoiceRequestSchema,
  createShareInvoiceRequestSchema,
  invoiceSchema,
  invoiceShareListResponseSchema,
  publicSharedInvoiceSchema,
  revokeInvoiceSharesResponseSchema,
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
    const sourceImportDocumentId = '22222222-2222-4222-8222-222222222222';
    expect(invoiceSchema.parse({
      ...invoice,
      externalNumber: 'CLIENT-42',
      sourceImportDocumentId,
      externalIssuerName: 'Cleancorp Ltd',
      thirdPartyIssued: true,
    })).toMatchObject({
      invoiceNumber: 'INV-2026-0001',
      externalNumber: 'CLIENT-42',
      sourceImportDocumentId,
      externalIssuerName: 'Cleancorp Ltd',
      thirdPartyIssued: true,
    });
  });

  it('accepts an optional nullable external number on invoice creation', () => {
    const input = { customerId: invoice.customerId, date: invoice.date, dueDate: invoice.dueDate, items: [{ description: 'Work', quantity: '1', rate: '10' }] };
    expect(createInvoiceRequestSchema.parse({ ...input, externalNumber: 'BUYER-INV-9' }).externalNumber).toBe('BUYER-INV-9');
    expect(createInvoiceRequestSchema.parse({ ...input, externalNumber: null }).externalNumber).toBeNull();
    expect(createInvoiceRequestSchema.safeParse({ ...input, externalNumber: 'x'.repeat(101) }).success).toBe(false);
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
        replace: false,
      }).templateName,
    ).toBe('classic');
    expect(createShareInvoiceRequestSchema.parse({ replace: true }).replace).toBe(true);
    expect(createShareInvoiceRequestSchema.safeParse({ replace: 'yes' }).success).toBe(false);
    expect(
      createShareInvoiceRequestSchema.safeParse({ organisationId: invoice.customerId }).success,
    ).toBe(false);
  });

  it('describes active shares and a revoke result without ownership ids', () => {
    const share = shareInvoiceResponseSchema.parse({
      shareToken: 'a1b2c3d4e5f6789012345678abcdef01',
      templateName: 'classic',
      expiresAt: null,
      isActive: true,
      accessCount: 2,
      createdAt: '2026-10-24T00:00:00.000Z',
    });
    expect(share.templateName).toBe('classic');
    expect(share.accessCount).toBe(2);
    expect(invoiceShareListResponseSchema.parse({ shares: [share] }).shares).toEqual([share]);
    expect(invoiceShareListResponseSchema.safeParse({ shares: [], organisationId: share.shareToken }).success).toBe(false);
    expect(revokeInvoiceSharesResponseSchema.parse({ revoked: 0 }).revoked).toBe(0);
    expect(revokeInvoiceSharesResponseSchema.safeParse({ revoked: -1 }).success).toBe(false);
    expect(revokeInvoiceSharesResponseSchema.safeParse({ revoked: 1, organisationId: share.shareToken }).success).toBe(false);
  });

  it('accepts a public shared invoice snapshot', () => {
    const shared = shareInvoiceResponseSchema.parse({
      shareToken: 'a1b2c3d4e5f6789012345678abcdef01',
      templateName: 'classic',
      expiresAt: null,
      isActive: true,
      accessCount: 0,
      createdAt: '2026-10-24T00:00:00.000Z',
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

describe('invoice lifecycle contracts', () => {
  it('accepts line discounts and multiple taxes without client totals', () => {
    const parsed = createInvoiceRequestSchema.parse({
      customerId: crypto.randomUUID(), date: '2026-10-23', dueDate: '2026-11-23',
      items: [{
        description: 'Implementation', quantity: '2', rate: '100',
        discountType: 'percent', discountValue: '10',
        taxes: [
          { id: 'gst', name: 'GST', rate: '15' },
          { id: 'levy', name: 'Levy', rate: '2.5' },
        ],
      }],
    });
    expect(parsed.items[0]?.taxes).toHaveLength(2);
  });

  it('validates lifecycle, attachment and import DTOs', () => {
    expect(invoiceLifecycleActionRequestSchema.parse({ reason: 'Customer request' }).reason).toBe('Customer request');
    expect(invoiceAttachmentSchema.parse({
      id: crypto.randomUUID(), invoiceId: crypto.randomUUID(), filename: 'brief.pdf',
      contentType: 'application/pdf', size: 123, role: 'source_document', locked: true,
      createdAt: new Date().toISOString(),
    })).toMatchObject({ filename: 'brief.pdf', role: 'source_document', locked: true });
    expect(importInvoicesRequestSchema.parse({ dryRun: true, rows: [{
      externalId: 'legacy-1', customerId: crypto.randomUUID(), date: '2026-10-23',
      dueDate: '2026-11-23', currency: 'NZD', invoiceNumber: 'SOURCE-100', status: 'paid',
      paymentDate: '2026-10-24', paymentMethod: 'bank_transfer', paymentReference: 'BANK-1',
      items: [{ description: 'Work', quantity: '1', rate: '20' }],
    }] }).rows[0]).toMatchObject({ invoiceNumber: 'SOURCE-100', paymentDate: '2026-10-24', paymentMethod: 'bank_transfer' });
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
