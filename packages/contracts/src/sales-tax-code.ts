import { z } from 'zod';
import { taxPeriodDateSchema } from './gst-preparation';

/** NZ sales tax code. Historical 0% lines stay null (unclassified) until a person assigns one. */
export const salesTaxCodeSchema = z.enum(['standard_15', 'zero_rated', 'exempt']);
export type SalesTaxCode = z.infer<typeof salesTaxCodeSchema>;

const money = z.string().regex(/^-?\d+\.\d{2}$/);

export const salesTaxBoxImpactSchema = z.object({
  box5: money.nullable(),
  box6: money.nullable(),
  unclassifiedSales: money,
  zeroRatedSales: money,
  exemptSales: money,
  mappingStatus: z.enum(['supported', 'requires_confirmation']),
  totalSales: money,
}).strict();
export type SalesTaxBoxImpact = z.infer<typeof salesTaxBoxImpactSchema>;

export const salesTaxReclassificationLineSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  date: taxPeriodDateSchema,
  description: z.string(),
  total: money,
  taxCode: z.null(),
}).strict();
export type SalesTaxReclassificationLine = z.infer<typeof salesTaxReclassificationLineSchema>;

export const salesTaxReclassifyPreviewRequestSchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1).max(200),
  taxCode: z.enum(['zero_rated', 'exempt']),
}).strict();

export const salesTaxReclassifyRequestSchema = salesTaxReclassifyPreviewRequestSchema.extend({
  reason: z.string().trim().min(8).max(1000),
}).strict();

export const salesTaxPeriodImpactSchema = z.object({
  from: taxPeriodDateSchema,
  to: taxPeriodDateSchema,
  before: salesTaxBoxImpactSchema,
  after: salesTaxBoxImpactSchema,
}).strict();
export type SalesTaxPeriodImpact = z.infer<typeof salesTaxPeriodImpactSchema>;

export const salesTaxReclassifyPreviewSchema = z.object({
  taxCode: z.enum(['zero_rated', 'exempt']),
  lineCount: z.number().int().positive(),
  before: salesTaxBoxImpactSchema,
  after: salesTaxBoxImpactSchema,
  periods: z.array(salesTaxPeriodImpactSchema).min(1),
}).strict();

export const salesTaxReclassificationSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['apply', 'undo']),
  taxCode: z.enum(['zero_rated', 'exempt']).nullable(),
  reason: z.string(),
  lineIds: z.array(z.string().uuid()),
  before: salesTaxBoxImpactSchema,
  after: salesTaxBoxImpactSchema,
  periods: z.array(salesTaxPeriodImpactSchema).min(1).optional(),
  undoneAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
}).strict();

export const salesTaxReclassificationListSchema = z.object({
  lines: z.array(salesTaxReclassificationLineSchema),
  events: z.array(salesTaxReclassificationSchema),
}).strict();

export const undoSalesTaxReclassificationRequestSchema = z.object({
  reason: z.string().trim().min(8).max(1000),
}).strict();

export type SalesTaxReclassifyPreviewRequest = z.infer<typeof salesTaxReclassifyPreviewRequestSchema>;
export type SalesTaxReclassifyRequest = z.infer<typeof salesTaxReclassifyRequestSchema>;
export type SalesTaxReclassifyPreview = z.infer<typeof salesTaxReclassifyPreviewSchema>;
export type SalesTaxReclassification = z.infer<typeof salesTaxReclassificationSchema>;
export type SalesTaxReclassificationList = z.infer<typeof salesTaxReclassificationListSchema>;
export type UndoSalesTaxReclassificationRequest = z.infer<typeof undoSalesTaxReclassificationRequestSchema>;
