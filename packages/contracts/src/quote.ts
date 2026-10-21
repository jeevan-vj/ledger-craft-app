import { z } from 'zod';
import { businessProfileSchema, quoteKindSchema } from './business-profile';
import {
  additionalChargeSchema,
  invoiceLineInputSchema,
  invoiceLineSchema,
  invoiceSchema,
  refineDiscount,
} from './invoice';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) return true;
  }
  return false;
}
const discountType = z.enum(['fixed', 'percent']);

export const quoteStatusSchema = z.enum([
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'converted',
]);

export { quoteKindSchema };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 1) - 1 && date.getUTCDate() === day;
}, 'Enter a real date');

function refineExpiry(
  value: { date?: string; expiryDate?: string },
  ctx: z.RefinementCtx,
) {
  if (value.date && value.expiryDate && value.expiryDate < value.date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Valid until date can't be before the quote date",
      path: ['expiryDate'],
    });
  }
}

const quoteCommercialFields = {
  kind: quoteKindSchema.optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  templateName: z.string().min(1).max(64).nullable().optional(),
  taxInclusive: z.boolean().optional(),
  taxRate: money.nullable().optional(),
  discountType: discountType.optional(),
  discountPercent: money.nullable().optional(),
  discount: money.nullable().optional(),
  additionalCharges: money.nullable().optional(),
  additionalChargesList: z.array(additionalChargeSchema).max(100).optional(),
};

export const createQuoteRequestSchema = z
  .object({
    customerId: z.string().uuid(),
    date: isoDate,
    expiryDate: isoDate.optional(),
    items: z.array(invoiceLineInputSchema).min(1),
    ...quoteCommercialFields,
  })
  .strict()
  .superRefine(refineDiscount)
  .superRefine(refineExpiry);

export const updateQuoteRequestSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    date: isoDate.optional(),
    expiryDate: isoDate.optional(),
    items: z.array(invoiceLineInputSchema).min(1).optional(),
    ...quoteCommercialFields,
  })
  .strict()
  .superRefine(refineDiscount)
  .superRefine(refineExpiry);

export const quoteSchema = z.object({
  id: z.string().uuid(),
  quoteNumber: z.string().min(1),
  kind: quoteKindSchema,
  revision: z.number().int().min(1),
  customerId: z.string().uuid(),
  customerName: z.string().nullable(),
  date: isoDate,
  expiryDate: isoDate,
  subtotal: money,
  taxAmount: money,
  taxRate: money,
  taxInclusive: z.boolean(),
  discountType: discountType,
  discountPercent: money.nullable(),
  discount: money.nullable(),
  additionalCharges: money.nullable(),
  additionalChargesList: z.array(additionalChargeSchema).optional(),
  additionalChargesTotal: money.optional(),
  total: money,
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  currency: z.string(),
  templateName: z.string().nullable(),
  status: quoteStatusSchema,
  sentAt: z.string().nullable(),
  publicViewedAt: z.string().nullable(),
  respondedAt: z.string().nullable(),
  respondedByName: z.string().nullable(),
  responseNote: z.string().nullable(),
  acceptedRevision: z.number().int().nullable(),
  convertedInvoiceId: z.string().uuid().nullable(),
  convertedInvoiceNumber: z.string().nullable(),
  items: z.array(invoiceLineSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const quoteCountsSchema = z.object({
  draft: z.number().int(),
  sent: z.number().int(),
  viewed: z.number().int(),
  accepted: z.number().int(),
  declined: z.number().int(),
  expired: z.number().int(),
  converted: z.number().int(),
});

export const quoteListResponseSchema = z.object({
  quotes: z.array(quoteSchema),
  counts: quoteCountsSchema,
});

export const nextQuoteNumberResponseSchema = z.object({
  quoteNumber: z.string().min(1),
});

export const quoteListQuerySchema = z.object({
  status: quoteStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
}).strict();

export const createShareQuoteRequestSchema = z
  .object({
    templateName: z.string().min(1).max(64).optional(),
    expiresAt: z.string().min(1).nullable().optional(),
  })
  .strict();

export const shareQuoteResponseSchema = z.object({
  shareToken: z.string().min(1),
  expiresAt: z.string().nullable(),
  isActive: z.boolean(),
  revision: z.number().int(),
});

export const quoteStatusChangeSchema = z
  .object({
    status: z.enum(['accepted', 'declined']),
    name: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const sendQuoteRequestSchema = z
  .object({
    to: z.array(z.string().email()).max(5).optional(),
  })
  .strict();

export const respondToQuoteRequestSchema = z
  .object({
    action: z.enum(['accept', 'decline']),
    name: z.string().trim().min(1).max(120).refine(
      (value) => !containsControlCharacter(value),
      'Enter a name without control characters',
    ),
    note: z.string().trim().max(1000).optional().refine(
      (value) => value == null || !containsControlCharacter(value),
      'Note cannot include control characters',
    ),
  })
  .strict();

export const publicQuoteResponseSchema = z.object({
  action: z.enum(['accept', 'decline']),
  name: z.string().nullable(),
  note: z.string().nullable(),
  respondedAt: z.string().nullable(),
  acceptedRevision: z.number().int().nullable(),
});

export const publicSharedQuoteSchema = z.object({
  quote: quoteSchema,
  templateName: z.string().min(1),
  businessProfile: businessProfileSchema,
  status: quoteStatusSchema,
  expiryDate: isoDate,
  respondedByName: z.string().nullable(),
  responseNote: z.string().nullable(),
  respondedAt: z.string().nullable(),
});

export const convertQuoteResponseSchema = z.object({
  quote: quoteSchema,
  invoice: invoiceSchema,
});

export type QuoteStatus = z.infer<typeof quoteStatusSchema>;
export type QuoteKind = z.infer<typeof quoteKindSchema>;
export type CreateQuoteRequest = z.infer<typeof createQuoteRequestSchema>;
export type UpdateQuoteRequest = z.infer<typeof updateQuoteRequestSchema>;
export type QuoteDto = z.infer<typeof quoteSchema>;
export type QuoteCounts = z.infer<typeof quoteCountsSchema>;
export type QuoteListResponse = z.infer<typeof quoteListResponseSchema>;
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
export type NextQuoteNumberResponse = z.infer<typeof nextQuoteNumberResponseSchema>;
export type CreateShareQuoteRequest = z.infer<typeof createShareQuoteRequestSchema>;
export type ShareQuoteResponse = z.infer<typeof shareQuoteResponseSchema>;
export type QuoteStatusChange = z.infer<typeof quoteStatusChangeSchema>;
export type SendQuoteRequest = z.infer<typeof sendQuoteRequestSchema>;
export type RespondToQuoteRequest = z.infer<typeof respondToQuoteRequestSchema>;
export type PublicQuoteResponse = z.infer<typeof publicQuoteResponseSchema>;
export type PublicSharedQuote = z.infer<typeof publicSharedQuoteSchema>;
export type ConvertQuoteResponse = z.infer<typeof convertQuoteResponseSchema>;
