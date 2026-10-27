import { z } from 'zod';

const atMostTwoDecimalPlaces = /^\d+(?:\.\d{1,2})?$/;
const moreThanTwoDecimalPlaces = /^\d+\.\d{3,}$/;

/** Positive decimal text with at most two fractional digits. Shared by quick-sale lines and payment amounts. */
export const positiveAmountAtMostTwoDecimals = z.string().superRefine((value, ctx) => {
  if (!atMostTwoDecimalPlaces.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: moreThanTwoDecimalPlaces.test(value)
        ? 'Amount must have at most 2 decimal places'
        : 'Amount must be a positive decimal with at most 2 decimal places',
    });
    return;
  }
  if (!(Number(value) > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount must be greater than 0' });
  }
});
