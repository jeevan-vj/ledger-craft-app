import { z } from 'zod';
import { gstAccountingBasisSchema, gstDateSchema, gstSettingsSchema } from './gst-settings';

const money = z.string().regex(/^-?\d+\.\d{2}$/);
export const gstCalculationSourceTypes = ['journals', 'journalLines', 'invoices', 'bills', 'expenses', 'payments', 'billPayments', 'creditNotes', 'creditNoteRefunds'] as const;
const sourceType = z.enum(gstCalculationSourceTypes);
const scalar = z.union([z.string(), z.boolean(), z.number().int(), z.null()]);
export const gstCalculationSourceSchema = z.object({
  type: sourceType, id: z.string().uuid(), date: gstDateSchema,
  documentId: z.string().uuid().optional(), values: z.record(z.string(), scalar),
}).strict();
const ids = z.array(z.string().uuid());
const count = z.number().int().nonnegative();
export const gstCalculationSnapshotSchema = z.object({
  version: z.literal('gst-ledger-v2'), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), calculatedAt: z.string().datetime(),
  period: z.object({ from: gstDateSchema, to: gstDateSchema, basis: gstAccountingBasisSchema }).strict(),
  settings: gstSettingsSchema,
  figures: z.object({ totalSales: money, totalPurchases: money, gstOnSales: money, gstOnPurchases: money, netGst: money }).strict(),
  sources: z.array(gstCalculationSourceSchema),
  sourceIds: z.object({ journals: ids, journalLines: ids, invoices: ids, bills: ids, expenses: ids, payments: ids, billPayments: ids, creditNotes: ids, creditNoteRefunds: ids }).strict(),
  sourceCounts: z.object({ journals: count, journalLines: count, invoices: count, bills: count, expenses: count, payments: count, billPayments: count, creditNotes: count, creditNoteRefunds: count }).strict(),
  myIrBoxes: z.object({ '5': money.optional(), '6': money.optional(), '7': money.optional(), '8': money.optional(), '9': money.optional(), '10': money, '11': money.optional(), '12': money.optional(), '13': money.optional(), '14': money, '15': money }).strict(),
  mappingStatus: z.enum(['supported', 'requires_confirmation']),
  warnings: z.array(z.string()), requiresReview: z.boolean(), result: z.enum(['payable', 'refund', 'nil']),
}).strict();

export type GstCalculationSource = z.infer<typeof gstCalculationSourceSchema>;
export type GstCalculationSnapshot = z.infer<typeof gstCalculationSnapshotSchema>;
