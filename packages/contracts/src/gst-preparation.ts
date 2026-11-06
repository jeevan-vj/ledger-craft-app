import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Must be a valid calendar date');
const money = z.string().regex(/^-?\d+\.\d{2}$/);

export const gstPreparationQuerySchema = z.object({ from: date, to: date }).strict()
  .refine((value) => value.from <= value.to, { message: 'From date must not be after to date', path: ['from'] });

export const gstPreparationResponseSchema = z.object({
  basis: z.literal('invoice'),
  from: date,
  to: date,
  baseCurrency: z.literal('NZD'),
  totalSales: money,
  totalPurchases: money,
  gstOnSales: z.string().regex(/^-?\d+\.\d{2}$/),
  gstOnPurchases: z.string().regex(/^-?\d+\.\d{2}$/),
  netGstPosition: z.string().regex(/^-?\d+\.\d{2}$/),
  warnings: z.array(z.string()),
}).strict();

export type GstPreparationQuery = z.infer<typeof gstPreparationQuerySchema>;
export type GstPreparationResponse = z.infer<typeof gstPreparationResponseSchema>;
