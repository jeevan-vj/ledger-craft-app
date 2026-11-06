import { z } from 'zod';
import { invoiceLineInputSchema, invoiceLineSchema } from './invoice';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a real calendar date');
const money = z.string().regex(/^\d+(\.\d+)?$/);
const positiveCents = z.string().regex(/^\d+(\.\d{1,2})?$/).refine(value => /[1-9]/.test(value), 'Amount must be positive');
const reason = z.string().trim().min(8).max(1000);
export const createCreditNoteRequestSchema = z.object({
  invoiceId: z.string().uuid(), issueDate: date, reason, taxInclusive: z.boolean(), taxRate: money,
  items: z.array(invoiceLineInputSchema).min(1).max(100),
}).strict();
export const reverseCreditNoteRequestSchema = z.object({ date, reason }).strict();
export const refundCreditNoteRequestSchema = z.object({
  amount: positiveCents, refundDate: date, bankAccountId: z.string().uuid(), exchangeRateId: z.string().uuid().optional(), reference: z.string().trim().max(200).optional(),
}).strict();
export const creditNoteRefundSchema = z.object({
  id: z.string().uuid(), creditNoteId: z.string().uuid(), amount: money, refundDate: date, bankAccountId: z.string().uuid(),
  currency: z.string(), baseCurrency: z.string(), exchangeRate: money, exchangeRateId: z.string().uuid().nullable(),
  baseAmount: money, bookBaseAmount: money, exchangeDifference: z.string().regex(/^-?\d+\.\d{2}$/),
  reference: z.string().nullable(), status: z.enum(['completed', 'reversed']), reversalDate: date.nullable(), reversalReason: z.string().nullable(),
  createdAt: z.string().datetime(), createdBy: z.string(),
});
export const creditNoteSchema = z.object({
  id: z.string().uuid(), creditNoteNumber: z.string(), invoiceId: z.string().uuid(), customerId: z.string().uuid(), issueDate: date,
  reason: z.string(), status: z.enum(['issued', 'reversed']), reversalDate: date.nullable(), reversalReason: z.string().nullable(),
  currency: z.string(), exchangeRate: money, exchangeRateId: z.string().uuid().nullable(), baseCurrency: z.string(),
  subtotal: money, taxAmount: money, total: money, baseTotal: money, baseTaxAmount: money,
  receivableAmount: money, baseReceivableAmount: money, customerCreditAmount: money, baseCustomerCreditAmount: money, baseCustomerCreditTaxAmount: money,
  refundedAmount: money, baseRefundedAmount: money, refundAvailable: money,
  items: z.array(invoiceLineSchema), refunds: z.array(creditNoteRefundSchema), createdAt: z.string().datetime(), createdBy: z.string(),
});
export const creditNoteListResponseSchema = z.object({ creditNotes: z.array(creditNoteSchema) });
export type CreateCreditNoteRequest = z.infer<typeof createCreditNoteRequestSchema>;
export type ReverseCreditNoteRequest = z.infer<typeof reverseCreditNoteRequestSchema>;
export type RefundCreditNoteRequest = z.infer<typeof refundCreditNoteRequestSchema>;
export type CreditNoteDto = z.infer<typeof creditNoteSchema>;
export type CreditNoteRefundDto = z.infer<typeof creditNoteRefundSchema>;
export type CreditNoteListResponse = z.infer<typeof creditNoteListResponseSchema>;
