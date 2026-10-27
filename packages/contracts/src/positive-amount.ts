import { z } from 'zod';

/** Positive decimal text with at most two fractional digits. Shared by quick-sale lines and payment amounts. */
export const positiveAmountAtMostTwoDecimals = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, 'Amount must have at most 2 decimal places')
  .refine((value) => Number(value) > 0, 'Amount must be greater than 0');
