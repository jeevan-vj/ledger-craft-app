import { z } from 'zod';
import { taxPeriodDateSchema } from './gst-preparation';

const money = z.string().regex(/^\d+\.\d{2}$/).refine((value) => value !== '0.00', 'Customs GST must be greater than zero');
export const createCustomsGstRequestSchema = z.object({
  invoiceDate: taxPeriodDateSchema,
  paymentDate: taxPeriodDateSchema.nullable().optional(),
  amount: money,
  reference: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(1000),
}).strict();
export const payCustomsGstRequestSchema = z.object({
  paymentDate: taxPeriodDateSchema,
}).strict();
export const voidCustomsGstRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict();
export const customsGstEntrySchema = z.object({
  id: z.string().uuid(),
  invoiceDate: taxPeriodDateSchema,
  paymentDate: taxPeriodDateSchema.nullable(),
  amount: z.string().regex(/^\d+\.\d{2}$/),
  reference: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(['open', 'void']),
  claimDate: taxPeriodDateSchema.nullable(),
}).strict();
export const customsGstListSchema = z.object({ entries: z.array(customsGstEntrySchema) }).strict();

export type CreateCustomsGstRequest = z.infer<typeof createCustomsGstRequestSchema>;
export type PayCustomsGstRequest = z.infer<typeof payCustomsGstRequestSchema>;
export type VoidCustomsGstRequest = z.infer<typeof voidCustomsGstRequestSchema>;
export type CustomsGstEntry = z.infer<typeof customsGstEntrySchema>;
