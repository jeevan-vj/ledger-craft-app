import { z } from 'zod';
import { gstCalculationSnapshotSchema } from './gst-calculation';

export const taxPeriodDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Must be a valid calendar date');
const money = z.string().regex(/^-?\d+\.\d{2}$/);
export const gstBasisSchema = z.enum(['invoice', 'payments', 'hybrid']);
export const gstOutputAdjustmentTypes = ['private_use_output', 'bad_debt_recovered', 'change_of_use_output', 'prior_period_correction', 'other'] as const;
export const gstInputAdjustmentTypes = ['bad_debt_written_off', 'customs_gst', 'change_of_use_input', 'entertainment', 'prior_period_correction', 'other'] as const;
export const gstAdjustmentTypes = ['private_use_output', 'bad_debt_recovered', 'change_of_use_output', 'prior_period_correction', 'other', 'bad_debt_written_off', 'customs_gst', 'change_of_use_input', 'entertainment'] as const;
export const gstAdjustmentTypeSchema = z.enum(gstAdjustmentTypes);
export const gstSalesClassificationReviewSchema = z.object({
  zeroRatedSales: money, exemptSales: money,
  reason: z.string().trim().min(8).max(1000), sourceReference: z.string().trim().min(1).max(200),
}).strict();

export const gstAdjustmentSchema = z.object({
  kind: z.enum(['output', 'input']),
  type: gstAdjustmentTypeSchema.optional(),
  amount: money, grossAdjustment: money.optional(),
  reason: z.string().trim().min(8).max(1000), sourceReference: z.string().trim().min(1).max(200),
  note: z.string().trim().min(1).max(1000).optional(),
}).strict().superRefine((row, ctx) => {
  if (!row.type) return;
  const allowed = row.kind === 'output' ? gstOutputAdjustmentTypes : gstInputAdjustmentTypes;
  if (!(allowed as readonly string[]).includes(row.type)) {
    ctx.addIssue({ code: 'custom', message: 'Adjustment type does not belong to this GST box', path: ['type'] });
  }
  if (row.type === 'other' && !row.note) {
    ctx.addIssue({ code: 'custom', message: 'Other adjustments need a note', path: ['note'] });
  }
});

export const gstPreparationQuerySchema = z.object({ from: taxPeriodDateSchema, to: taxPeriodDateSchema, basis: gstBasisSchema.optional() }).strict()
  .refine((value) => value.from <= value.to, { message: 'From date must not be after to date', path: ['from'] });

export const gstPreparationResponseSchema = z.object({
  basis: gstBasisSchema,
  from: taxPeriodDateSchema,
  to: taxPeriodDateSchema,
  baseCurrency: z.literal('NZD'),
  totalSales: money,
  totalPurchases: money,
  zeroRatedSales: money.optional(), exemptSales: money.optional(), unclassifiedSales: money.optional(), claimablePurchases: money.optional(), salesClassificationSupported: z.boolean().optional(),
  gstOnSales: z.string().regex(/^-?\d+\.\d{2}$/),
  gstOnPurchases: z.string().regex(/^-?\d+\.\d{2}$/),
  netGstPosition: z.string().regex(/^-?\d+\.\d{2}$/),
  warnings: z.array(z.string()),
  requiresReview: z.boolean().optional(),
  calculation: gstCalculationSnapshotSchema.optional(),
  review: z.object({
    confirmed: z.literal(true), reviewedAt: z.string().datetime(), reviewedBy: z.string().min(1),
    adjustments: z.array(gstAdjustmentSchema),
    unadjustedGstOnSales: money, unadjustedGstOnPurchases: money, unadjustedTotalSales: money.optional(), unadjustedTotalPurchases: money.optional(),
    salesClassificationReview: gstSalesClassificationReviewSchema.optional(),
  }).optional(),
}).strict();

export type GstPreparationQuery = z.infer<typeof gstPreparationQuerySchema>;
export type GstPreparationResponse = z.infer<typeof gstPreparationResponseSchema>;

const orderedPeriod = { from: taxPeriodDateSchema, to: taxPeriodDateSchema };
export const gstAdjustmentPreparationRequestSchema = z.object({
  ...orderedPeriod, basis: gstBasisSchema.optional(),
  reviewConfirmed: z.literal(true), adjustments: z.array(gstAdjustmentSchema).max(100),
  salesClassificationReview: gstSalesClassificationReviewSchema.optional(),
}).strict().refine((value) => value.from <= value.to, { message: 'From date must not be after to date', path: ['from'] });
const nonnegativeMoney = z.string().regex(/^\d+\.\d{2}$/);
export const companyTaxAdjustmentSchema = z.object({
  kind: z.enum(['add_back', 'deduction']), amount: nonnegativeMoney,
  reason: z.string().trim().min(8).max(1000), sourceReference: z.string().trim().min(1).max(200),
}).strict();
export const companyIncomeTaxPreparationRequestSchema = z.object({
  ...orderedPeriod, entityType: z.literal('nz_company'), taxRate: z.literal('28'), rateConfirmed: z.literal(true),
  adjustments: z.array(companyTaxAdjustmentSchema).max(100), lossesBroughtForward: nonnegativeMoney, taxCredits: nonnegativeMoney,
}).strict().refine((value) => value.from <= value.to, { message: 'From date must not be after to date', path: ['from'] });
export const companyIncomeTaxPreparationResponseSchema = z.object({
  from: taxPeriodDateSchema, to: taxPeriodDateSchema, entityType: z.literal('nz_company'), baseCurrency: z.literal('NZD'),
  taxRate: z.literal('28'), accountingProfit: money, addBacks: nonnegativeMoney, deductions: nonnegativeMoney,
  taxAdjustedProfit: money, lossesApplied: nonnegativeMoney, lossesCarriedForward: nonnegativeMoney, taxableIncome: nonnegativeMoney,
  incomeTax: nonnegativeMoney, taxCredits: nonnegativeMoney, incomeTaxPayable: nonnegativeMoney, excessCredits: nonnegativeMoney,
  adjustments: z.array(companyTaxAdjustmentSchema), lossesBroughtForward: nonnegativeMoney,
  preparedAt: z.string().datetime(), preparedBy: z.string().min(1), warnings: z.array(z.string()),
}).strict();
export type GstAdjustmentPreparationRequest = z.infer<typeof gstAdjustmentPreparationRequestSchema>;
export type GstAdjustment = z.infer<typeof gstAdjustmentSchema>;
export type CompanyIncomeTaxPreparationRequest = z.infer<typeof companyIncomeTaxPreparationRequestSchema>;
export type CompanyIncomeTaxPreparationResponse = z.infer<typeof companyIncomeTaxPreparationResponseSchema>;
