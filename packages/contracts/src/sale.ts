import { z } from 'zod';
import { invoiceSchema } from './invoice';
import { paymentSchema } from './payment';
import { paymentReceiptSchema } from './receipt';

const positiveAmount = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, 'Amount must have at most 2 decimal places')
  .refine((value) => Number(value) > 0, 'Amount must be greater than 0');

export const salePaymentMethodSchema = z.enum(['cash', 'credit_card', 'bank_transfer']);

export const saleCatalogLineSchema = z
  .object({
    itemId: z.string().uuid(),
    quantity: positiveAmount,
    price: positiveAmount,
  })
  .strict();

export const saleCustomLineSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    quantity: positiveAmount,
    price: positiveAmount,
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

export type SalePaymentMethod = z.infer<typeof salePaymentMethodSchema>;
export type SaleLine = z.infer<typeof saleLineSchema>;
export type CreateSaleRequest = z.infer<typeof createSaleRequestSchema>;
export type SaleResponse = z.infer<typeof saleResponseSchema>;
