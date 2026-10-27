import { z } from 'zod';
import { positiveAmountAtMostTwoDecimals } from './positive-amount';

const money = z.string().regex(/^\d+(\.\d+)?$/);
const paymentMethod = z.enum(['bank_transfer', 'cash', 'cheque', 'credit_card', 'online']);
const paymentStatus = z.enum(['pending', 'completed', 'failed', 'cancelled', 'refunded']);

export const paymentSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string().nullable(),
  paymentMethod,
  amount: money,
  paymentDate: z.string().min(1),
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),
  status: paymentStatus,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createPaymentRequestSchema = z
  .object({
    invoiceId: z.string().uuid(),
    paymentMethod,
    amount: positiveAmountAtMostTwoDecimals,
    paymentDate: z.string().min(1),
    referenceNumber: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

export const paymentListResponseSchema = z.object({
  payments: z.array(paymentSchema),
});

export const accountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.string().min(1),
  currency: z.string().min(1),
  openingBalance: money,
  currentBalance: money,
  accountNumber: z.string().nullable(),
  accountClass: z.string().nullable(),
  isActive: z.boolean(),
});

export const accountListResponseSchema = z.object({
  accounts: z.array(accountSchema),
});

export const createAccountRequestSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    currency: z.string().min(1).optional(),
    openingBalance: money.optional(),
    accountNumber: z.string().nullable().optional(),
    accountClass: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateAccountRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    currency: z.string().min(1).optional(),
    openingBalance: money.optional(),
    currentBalance: money.optional(),
    accountNumber: z.string().nullable().optional(),
    accountClass: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const initializeAccountsRequestSchema = z
  .object({
    countryCode: z.string().min(2).max(2).optional(),
  })
  .strict();

export type PaymentDto = z.infer<typeof paymentSchema>;
export type CreatePaymentRequest = z.infer<typeof createPaymentRequestSchema>;
export type PaymentListResponse = z.infer<typeof paymentListResponseSchema>;
export type AccountDto = z.infer<typeof accountSchema>;
export type AccountListResponse = z.infer<typeof accountListResponseSchema>;
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;
export type InitializeAccountsRequest = z.infer<typeof initializeAccountsRequestSchema>;
