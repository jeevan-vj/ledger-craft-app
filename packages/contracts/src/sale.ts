import { z } from 'zod';
import { invoiceSchema } from './invoice';
import { paymentSchema } from './payment';
import { paymentReceiptSchema } from './receipt';
import { positiveAmountAtMostTwoDecimals } from './positive-amount';

export const salePaymentMethodSchema = z.enum(['cash', 'credit_card', 'bank_transfer']);

export const saleCatalogLineSchema = z
  .object({
    itemId: z.string().uuid(),
    quantity: positiveAmountAtMostTwoDecimals,
    price: positiveAmountAtMostTwoDecimals,
  })
  .strict();

export const saleCustomLineSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    quantity: positiveAmountAtMostTwoDecimals,
    price: positiveAmountAtMostTwoDecimals,
  })
  .strict();

export const saleLineSchema = z.union([saleCatalogLineSchema, saleCustomLineSchema]);

export const createSaleRequestSchema = z
  .object({
    lines: z.array(saleLineSchema).min(1).max(100),
    paymentMethod: salePaymentMethodSchema,
    customerId: z.string().uuid().nullable().optional(),
    referenceNumber: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();

export const saleResponseSchema = z.object({
  invoice: invoiceSchema,
  payment: paymentSchema,
  receipt: paymentReceiptSchema,
});

const summaryMoney = z.string().regex(/^\d+\.\d{2}$/, 'Amount must be a 2-decimal string');

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const salesSummaryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine(isCalendarDate, 'Date must be a real calendar date');

export const salesSummaryQuerySchema = z
  .object({
    date: salesSummaryDateSchema,
  })
  .strict();

export const salesSummaryMethodTotalSchema = z.object({
  paymentMethod: z.string().trim().min(1).max(40),
  total: summaryMoney,
});

export const salesSummaryItemSchema = z.object({
  description: z.string().min(1),
  quantity: summaryMoney,
  amount: summaryMoney,
});

export const salesSummarySaleSchema = z.object({
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  total: summaryMoney,
  taxAmount: summaryMoney,
});

export const salesSummarySchema = z.object({
  date: salesSummaryDateSchema,
  count: z.number().int().nonnegative(),
  grossTotal: summaryMoney,
  gstTotal: summaryMoney,
  paymentMethods: z.array(salesSummaryMethodTotalSchema),
  topItemsByQuantity: z.array(salesSummaryItemSchema),
  topItemsByAmount: z.array(salesSummaryItemSchema),
  sales: z.array(salesSummarySaleSchema),
});

export type SalePaymentMethod = z.infer<typeof salePaymentMethodSchema>;
export type SaleLine = z.infer<typeof saleLineSchema>;
export type CreateSaleRequest = z.infer<typeof createSaleRequestSchema>;
export type SaleResponse = z.infer<typeof saleResponseSchema>;
export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
export type SalesSummary = z.infer<typeof salesSummarySchema>;
