import { z } from 'zod';
import { gstDateSchema } from './gst-settings';

const money = z.string().regex(/^-?\d+\.\d{2}$/);
const nonzeroMoney = money.refine((value) => decimalUnits(value) !== 0n, 'Enter the GST discrepancy');

function decimalUnits(value: string): bigint {
  const negative = value.startsWith('-');
  const digits = value.replace('-', '').replace('.', '');
  const units = BigInt(digits);
  return negative ? -units : units;
}

export const gstCorrectionSourceTypes = ['invoice', 'bill', 'expense', 'credit_note', 'payment', 'bill_payment', 'customs_gst'] as const;
export const gstCorrectionActions = ['added', 'changed', 'voided'] as const;
export const gstCorrectionStatuses = ['pending', 'over_limit', 'included', 'resolved', 'withdrawn'] as const;

export const gstPriorPeriodCorrectionDisclosureSchema = z.object({
  id: z.string().uuid(),
  originalTaxReturnId: z.string().uuid(),
  originalPeriodStart: gstDateSchema,
  originalPeriodEnd: gstDateSchema,
  sourceType: z.enum(gstCorrectionSourceTypes),
  sourceId: z.string().uuid(),
  action: z.enum(gstCorrectionActions),
  kind: z.enum(['output', 'input']),
  amount: money,
  reason: z.string().trim().min(8).max(1000),
}).strict();

export const createGstCorrectionRequestSchema = z.object({
  originalPeriodStart: gstDateSchema,
  originalPeriodEnd: gstDateSchema,
  sourceType: z.enum(gstCorrectionSourceTypes),
  sourceId: z.string().uuid(),
  action: z.enum(gstCorrectionActions),
  kind: z.enum(['output', 'input']),
  amount: nonzeroMoney,
  reason: z.string().trim().min(8).max(1000),
}).strict().refine((value) => value.originalPeriodStart <= value.originalPeriodEnd, {
  message: 'Original period start must not be after period end',
  path: ['originalPeriodStart'],
});

export const resolveGstCorrectionRequestSchema = z.object({
  resolution: z.literal('amend_in_myir'),
  reason: z.string().trim().min(8).max(1000),
}).strict();

export const gstPeriodCorrectionSchema = gstPriorPeriodCorrectionDisclosureSchema.extend({
  targetPeriodStart: gstDateSchema,
  targetPeriodEnd: gstDateSchema,
  status: z.enum(gstCorrectionStatuses),
  carryForward: z.enum(['included', 'refused', 'not_applicable']),
  netDiscrepancy: money,
  limit: money,
  resolution: z.literal('amend_in_myir').nullable(),
  guidance: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
}).strict();

export const gstPeriodCorrectionListSchema = z.object({
  corrections: z.array(gstPeriodCorrectionSchema),
}).strict();

export type GstCorrectionSourceType = (typeof gstCorrectionSourceTypes)[number];
export type CreateGstCorrectionRequest = z.infer<typeof createGstCorrectionRequestSchema>;
export type ResolveGstCorrectionRequest = z.infer<typeof resolveGstCorrectionRequestSchema>;
export type GstPeriodCorrection = z.infer<typeof gstPeriodCorrectionSchema>;
export type GstPriorPeriodCorrectionDisclosure = z.infer<typeof gstPriorPeriodCorrectionDisclosureSchema>;
