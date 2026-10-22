import { z } from 'zod';
import { businessProfileSchema } from './business-profile';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const paymentTermDays = z.number().int().min(0).max(365);
const discountType = z.enum(['fixed', 'percent']);

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

export const createInvoiceRequestSchema = z
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
    status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
    items: z.array(invoiceLineInputSchema).min(1),
  })
  .strict()
  .superRefine(refineDiscount);

export const updateInvoiceRequestSchema = z
  .object({
    status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
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
});

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().min(1),
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
  status: z.enum(['draft', 'sent', 'paid', 'overdue']),
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  currency: z.string(),
  customerName: z.string().nullable(),
  items: z.array(invoiceLineSchema),
  sourceQuoteId: z.string().uuid().optional(),
  sourceQuoteNumber: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

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
