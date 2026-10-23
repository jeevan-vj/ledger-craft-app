import { z } from 'zod';
import { businessProfileSchema } from './business-profile';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const paymentTermDays = z.number().int().min(0).max(365);
const discountType = z.enum(['fixed', 'percent']);
export const invoiceStatusSchema = z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']);

export const invoiceLineTaxSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  rate: money.refine((value) => Number(value) >= 0 && Number(value) <= 100, 'Tax rate must be between 0 and 100'),
}).strict();

export const additionalChargeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['delivery', 'handling', 'rush', 'service', 'processing', 'international', 'setup', 'administrative', 'custom']),
  label: z.string().min(1),
  calculationType: z.enum(['fixed', 'percentage']),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  description: z.string().optional(),
  isActive: z.boolean(),
}).strict();

export const invoiceLineInputSchema = z
  .object({
    description: z.string().min(1),
    quantity: money,
    unit: z.string().min(1).optional(),
    rate: money,
    rateUnit: z.string().min(1).optional(),
    discountType: discountType.optional(),
    discountValue: money.nullable().optional(),
    taxes: z.array(invoiceLineTaxSchema).max(10).optional(),
  })
  .strict();

export function refineDiscount(
  value: { discountType?: 'fixed' | 'percent'; discountPercent?: string | null; discount?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.discountType !== 'percent') return;
  if (value.discountPercent == null || value.discountPercent === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter a discount between 0 and 100%',
      path: ['discountPercent'],
    });
    return;
  }
  const percent = Number(value.discountPercent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter a discount between 0 and 100%',
      path: ['discountPercent'],
    });
  }
}

const createInvoiceRequestBaseSchema = z
  .object({
    customerId: z.string().uuid(),
    date: z.string().min(1),
    dueDate: z.string().min(1),
    notes: z.string().nullable().optional(),
    terms: z.string().nullable().optional(),
    currency: z.string().min(1).optional(),
    taxInclusive: z.boolean().optional(),
    taxRate: money.nullable().optional(),
    paymentTermDays: paymentTermDays.optional(),
    discountType: discountType.optional(),
    discountPercent: money.nullable().optional(),
    discount: money.nullable().optional(),
    additionalCharges: money.nullable().optional(),
    additionalChargesList: z.array(additionalChargeSchema).max(100).optional(),
    status: invoiceStatusSchema.exclude(['cancelled']).optional(),
    items: z.array(invoiceLineInputSchema).min(1),
  })
  .strict();

export const createInvoiceRequestSchema = createInvoiceRequestBaseSchema.superRefine(refineDiscount);

export const updateInvoiceRequestSchema = z
  .object({
    status: invoiceStatusSchema.exclude(['cancelled']).optional(),
    notes: z.string().nullable().optional(),
    terms: z.string().nullable().optional(),
    date: z.string().min(1).optional(),
    dueDate: z.string().min(1).optional(),
    paymentTermDays: paymentTermDays.nullable().optional(),
    discountType: discountType.optional(),
    discountPercent: money.nullable().optional(),
    discount: money.nullable().optional(),
    taxInclusive: z.boolean().optional(),
    taxRate: money.nullable().optional(),
    additionalCharges: money.nullable().optional(),
    additionalChargesList: z.array(additionalChargeSchema).max(100).optional(),
    items: z.array(invoiceLineInputSchema).min(1).optional(),
  })
  .strict()
  .superRefine(refineDiscount);

export const sendInvoiceRequestSchema = z
  .object({
    to: z.array(z.string().email()).max(5).optional(),
  })
  .strict();

export const remindInvoiceRequestSchema = z
  .object({
    to: z.array(z.string().email()).max(5).optional(),
    subject: z.string().min(1),
    html: z.string().min(1),
    reminderType: z.enum(['gentle', 'firm', 'final']).optional(),
    daysPastDue: z.number().int().optional(),
  })
  .strict();

export const invoiceLineSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  quantity: money,
  unit: z.string(),
  rate: money,
  rateUnit: z.string(),
  tax: money.nullable(),
  total: money,
  discountType: discountType.optional(),
  discountValue: money.nullable().optional(),
  discountAmount: money.optional(),
  taxes: z.array(invoiceLineTaxSchema).optional(),
});

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  externalId: z.string().nullable().optional(),
  customerId: z.string().uuid(),
  date: z.string().min(1),
  dueDate: z.string().min(1),
  paymentTermDays: paymentTermDays.nullable(),
  subtotal: money,
  taxAmount: money,
  discountType: discountType,
  discountPercent: money.nullable(),
  discount: money.nullable(),
  additionalCharges: money.nullable(),
  additionalChargesList: z.array(additionalChargeSchema).optional(),
  additionalChargesTotal: money.optional(),
  total: money,
  totalPaid: money,
  balanceDue: money,
  paymentStatus: z.string(),
  taxInclusive: z.boolean(),
  status: invoiceStatusSchema,
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  currency: z.string(),
  customerName: z.string().nullable(),
  items: z.array(invoiceLineSchema),
  sourceQuoteId: z.string().uuid().optional(),
  sourceQuoteNumber: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().nullable().optional(),
});

export const invoiceHistorySchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  action: z.enum(['created', 'updated', 'sent', 'cancelled', 'restored', 'archived', 'duplicated', 'attachment_added', 'attachment_removed', 'imported']),
  fromStatus: invoiceStatusSchema.nullable(),
  toStatus: invoiceStatusSchema.nullable(),
  reason: z.string().nullable(),
  createdAt: z.string().min(1),
});

export const invoiceAttachmentSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  size: z.number().int().positive().max(1_048_576),
  createdAt: z.string().min(1),
});

export const invoiceLifecycleActionRequestSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() }).strict();
export const createInvoiceAttachmentRequestSchema = z.object({
  objectKey: z.string().min(1), filename: z.string().min(1).max(255),
  contentType: invoiceAttachmentSchema.shape.contentType, size: z.number().int().positive().max(1_048_576),
}).strict();
export const invoiceHistoryResponseSchema = z.object({ history: z.array(invoiceHistorySchema) });
export const invoiceAttachmentsResponseSchema = z.object({ attachments: z.array(invoiceAttachmentSchema) });

export const importInvoiceRowSchema = createInvoiceRequestBaseSchema.extend({
  externalId: z.string().trim().min(1).max(120),
}).omit({ status: true }).extend({ status: invoiceStatusSchema.exclude(['cancelled']).optional() });
export const importInvoicesRequestSchema = z.object({ dryRun: z.boolean().default(true), rows: z.array(importInvoiceRowSchema).min(1).max(200) }).strict();
export const importInvoicesResponseSchema = z.object({ valid: z.boolean(), imported: z.number().int().nonnegative(), errors: z.array(z.object({ row: z.number().int().positive(), message: z.string() })) });

export const nextInvoiceNumberResponseSchema = z.object({
  invoiceNumber: z.string().min(1),
});

export const invoiceListResponseSchema = z.object({
  invoices: z.array(invoiceSchema),
});

export const createShareInvoiceRequestSchema = z
  .object({
    templateName: z.string().min(1).max(64).optional(),
    expiresAt: z.string().min(1).nullable().optional(),
  })
  .strict();

export const shareInvoiceResponseSchema = z.object({
  shareToken: z.string().min(1),
  expiresAt: z.string().nullable(),
  isActive: z.boolean(),
});

export const publicSharedInvoiceSchema = z.object({
  invoice: invoiceSchema,
  templateName: z.string().min(1),
  businessProfile: businessProfileSchema,
  attachments: z.array(invoiceAttachmentSchema).optional(),
});

export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;
export type UpdateInvoiceRequest = z.infer<typeof updateInvoiceRequestSchema>;
export type SendInvoiceRequest = z.infer<typeof sendInvoiceRequestSchema>;
export type RemindInvoiceRequest = z.infer<typeof remindInvoiceRequestSchema>;
export type InvoiceDto = z.infer<typeof invoiceSchema>;
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;
export type NextInvoiceNumberResponse = z.infer<typeof nextInvoiceNumberResponseSchema>;
export type CreateShareInvoiceRequest = z.infer<typeof createShareInvoiceRequestSchema>;
export type ShareInvoiceResponse = z.infer<typeof shareInvoiceResponseSchema>;
export type PublicSharedInvoice = z.infer<typeof publicSharedInvoiceSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type InvoiceHistoryDto = z.infer<typeof invoiceHistorySchema>;
export type InvoiceAttachmentDto = z.infer<typeof invoiceAttachmentSchema>;
export type InvoiceLifecycleActionRequest = z.infer<typeof invoiceLifecycleActionRequestSchema>;
export type CreateInvoiceAttachmentRequest = z.infer<typeof createInvoiceAttachmentRequestSchema>;
export type ImportInvoicesRequest = z.infer<typeof importInvoicesRequestSchema>;
export type ImportInvoicesResponse = z.infer<typeof importInvoicesResponseSchema>;
