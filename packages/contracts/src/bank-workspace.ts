import { z } from 'zod';
import { gstDateSchema } from './gst-settings';
const money = z.string().regex(/^-?\d+\.\d{2}$/);
export const bankDefaultAccountSchema = z.object({ bankAccountId: z.string().uuid().nullable() }).strict();
export const bankMovementQuerySchema = z.object({ from: gstDateSchema, to: gstDateSchema }).refine(value => value.from <= value.to, { message: 'Start date must not follow end date' });
export const bankMovementSchema = z.object({ bankAccountId: z.string().uuid(), currency: z.string(), from: gstDateSchema, to: gstDateSchema, openingBalance: money, inflows: money, outflows: money, movement: money, closingBalance: money });
export type BankMovement = z.infer<typeof bankMovementSchema>;
