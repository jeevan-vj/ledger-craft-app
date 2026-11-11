import { describe, expect, it } from 'vitest';
import { createInvoiceRequestSchema, invoiceLineInputSchema, invoiceSchema } from './invoice';
import { createCreditNoteRequestSchema } from './credit-note';
import { createQuoteRequestSchema } from './quote';
import { assistantProposalSchema, saveAssistantDraftEditsSchema } from './assistant';
import { salesTaxReclassifyRequestSchema } from './sales-tax-code';

const customerId = '44444444-4444-4444-4444-444444444444';

describe('sales tax codes on document lines', () => {
  it('accepts standard, zero-rated and exempt codes and rejects an unknown code', () => {
    expect(invoiceLineInputSchema.parse({ description: 'Export', quantity: '1', rate: '2000', taxCode: 'zero_rated' }).taxCode).toBe('zero_rated');
    expect(invoiceLineInputSchema.parse({ description: 'Grant', quantity: '1', rate: '1000', taxCode: 'exempt' }).taxCode).toBe('exempt');
    expect(invoiceLineInputSchema.parse({ description: 'Work', quantity: '1', rate: '100' }).taxCode).toBeUndefined();
    expect(invoiceLineInputSchema.safeParse({ description: 'Work', quantity: '1', rate: '100', taxCode: 'unclassified' }).success).toBe(false);
    expect(createInvoiceRequestSchema.parse({
      customerId, date: '2026-09-01', dueDate: '2026-09-30',
      items: [{ description: 'Export', quantity: '1', rate: '2000', taxCode: 'zero_rated' }],
    }).items[0].taxCode).toBe('zero_rated');
    expect(createQuoteRequestSchema.parse({
      customerId, date: '2026-09-01', expiryDate: '2026-10-01',
      items: [{ description: 'Exempt supply', quantity: '1', rate: '1000', taxCode: 'exempt' }],
    }).items[0].taxCode).toBe('exempt');
    expect(createCreditNoteRequestSchema.parse({
      invoiceId: '11111111-1111-4111-8111-111111111111', issueDate: '2026-09-10', reason: 'Returned exported goods', taxInclusive: false, taxRate: '0',
      items: [{ description: 'Export credit', quantity: '1', rate: '500', taxCode: 'zero_rated' }],
    }).items[0].taxCode).toBe('zero_rated');
  });

  it('reads a stored tax code on an invoice line and still accepts history without one', () => {
    const line = { id: '55555555-5555-4555-8555-555555555555', description: 'Export', quantity: '1', unit: 'ea', rate: '2000.00', rateUnit: 'ea', tax: '0.00', total: '2000.00', taxCode: 'zero_rated' as const };
    const invoice = invoiceSchema.parse({
      id: '33333333-3333-4333-8333-333333333333', invoiceNumber: 'INV-1', customerId, date: '2026-09-01', dueDate: '2026-09-30',
      paymentTermDays: null, subtotal: '2000.00', taxAmount: '0.00', discountType: 'fixed', discountPercent: null, discount: null, additionalCharges: null,
      total: '2000.00', totalPaid: '0.00', balanceDue: '2000.00', paymentStatus: 'unpaid', taxInclusive: false, status: 'sent', notes: null, terms: null,
      currency: 'NZD', customerName: null, items: [line], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(invoice.items[0].taxCode).toBe('zero_rated');
    const historical = invoiceSchema.parse({ ...invoice, items: [{ ...line, taxCode: undefined }] });
    expect(historical.items[0].taxCode).toBeUndefined();
  });

  it('lets an assistant proposal and a bulk reclassify carry a sales tax code', () => {
    const proposal = assistantProposalSchema.parse({
      id: '66666666-6666-4666-8666-666666666666', kind: 'invoice', status: 'ready', customerId, customerName: 'Harbour',
      date: '2026-09-01', dueDate: '2026-09-30', taxInclusive: true, taxRate: '15', currency: 'NZD', notes: null,
      lines: [{ description: 'Plumbing', quantity: '1', rate: '100.00', unit: null, itemId: null, missing: [], taxCode: 'standard_15' }],
      missing: [], totals: { subtotal: '86.96', taxAmount: '13.04', total: '100.00' }, actions: { saveDraft: true, send: false },
    });
    expect(proposal.lines[0].taxCode).toBe('standard_15');
    expect(saveAssistantDraftEditsSchema.parse({
      lines: [{ description: 'Export', quantity: '1', rate: '2000', taxRate: '0', taxCode: 'zero_rated' }],
    }).lines?.[0].taxCode).toBe('zero_rated');
    expect(salesTaxReclassifyRequestSchema.safeParse({
      lineIds: ['55555555-5555-4555-8555-555555555555'], taxCode: 'standard_15', reason: 'These exports were reviewed',
    }).success).toBe(false);
    expect(salesTaxReclassifyRequestSchema.parse({
      lineIds: ['55555555-5555-4555-8555-555555555555'], taxCode: 'exempt', reason: 'Reviewed exempt supplies',
    }).taxCode).toBe('exempt');
  });
});
