import { z } from 'zod';

const money = z.string().regex(/^\d+(\.\d+)?$/);
const paymentMethod = z.enum(['bank_transfer', 'cash', 'cheque', 'credit_card', 'online']);

export const paymentReceiptDataSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  customerName: z.string().min(1),
  customerEmail: z.string().email().nullable(),
  amountPaid: money,
  paymentDate: z.string().min(1),
  invoiceDate: z.string().min(1).optional(),
  invoiceDueDate: z.string().min(1).optional(),
  paymentMethod,
  currency: z.string().min(1),
  invoiceTotal: money,
  totalPaid: money,
  balanceDue: money,
});

export const paymentReceiptSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  receiptNumber: z.string().min(1),
  generatedAt: z.string().min(1),
  emailSentAt: z.string().nullable(),
  isEmailed: z.boolean(),
  receiptData: paymentReceiptDataSchema,
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
export type PaymentReceiptDataDto = z.infer<typeof paymentReceiptDataSchema>;
export type CreatePaymentReceiptRequest = z.infer<typeof createPaymentReceiptRequestSchema>;
export type PaymentReceiptListResponse = z.infer<typeof paymentReceiptListResponseSchema>;
