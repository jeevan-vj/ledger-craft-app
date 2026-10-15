import { z } from 'zod';

export const paymentReceiptSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  receiptNumber: z.string().min(1),
  generatedAt: z.string().min(1),
  emailSentAt: z.string().nullable(),
  isEmailed: z.boolean(),
  createdAt: z.string().min(1),
});

export const createPaymentReceiptRequestSchema = z
  .object({
    paymentId: z.string().uuid(),
  })
  .strict();

export const paymentReceiptListResponseSchema = z.object({
  receipts: z.array(paymentReceiptSchema),
});

export type PaymentReceiptDto = z.infer<typeof paymentReceiptSchema>;
export type CreatePaymentReceiptRequest = z.infer<typeof createPaymentReceiptRequestSchema>;
export type PaymentReceiptListResponse = z.infer<typeof paymentReceiptListResponseSchema>;
