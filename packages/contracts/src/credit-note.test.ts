import { describe, expect, it } from 'vitest';
import { createCreditNoteRequestSchema, refundCreditNoteRequestSchema, reverseCreditNoteRequestSchema } from './credit-note';

describe('credit note contracts', () => {
  it('requires a source invoice, positive credit lines, explicit GST treatment and documentary reason', () => {
    const input = { invoiceId: '11111111-1111-4111-8111-111111111111', issueDate: '2026-04-10', reason: 'Returned consulting services', taxInclusive: false, taxRate: '15', items: [{ description: 'Consulting credit', quantity: '1', rate: '200' }] };
    expect(createCreditNoteRequestSchema.parse(input)).toEqual(input);
    expect(createCreditNoteRequestSchema.safeParse({ ...input, organisationId: 'forged' }).success).toBe(false);
    expect(createCreditNoteRequestSchema.safeParse({ ...input, reason: '' }).success).toBe(false);
    expect(createCreditNoteRequestSchema.safeParse({ ...input, issueDate: '2026-02-30' }).success).toBe(false);
  });
  it('requires positive exact refunds and documented reversals', () => {
    const refund = { amount: '230.00', refundDate: '2026-04-20', bankAccountId: '11111111-1111-4111-8111-111111111111' };
    expect(refundCreditNoteRequestSchema.parse(refund)).toEqual(refund);
    for (const amount of ['-1.00', '0.00', '0', '1.234']) expect(refundCreditNoteRequestSchema.safeParse({ ...refund, amount }).success).toBe(false);
    expect(reverseCreditNoteRequestSchema.safeParse({ date: '2026-04-20', reason: '' }).success).toBe(false);
  });
});
