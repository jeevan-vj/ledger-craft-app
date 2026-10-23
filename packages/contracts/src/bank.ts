import { z } from 'zod';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const positiveMoney = money.refine((value) => !value.startsWith('-') && !/^0+(?:\.0+)?$/.test(value), {
  message: 'Amount must be greater than zero',
});
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountType = z.enum(['checking', 'savings', 'credit_card', 'business']);
const transactionType = z.enum(['debit', 'credit']);
const transactionSource = z.enum(['import', 'manual', 'transfer']);
const paymentMethod = z.enum(['bank_transfer', 'cash', 'card', 'cheque', 'other']);

export const bankAccountSchema = z.object({
  id: z.string().uuid(),
  accountName: z.string().min(1),
  accountNumber: z.string().min(1),
  bankName: z.string().min(1),
  accountType,
  currency: z.string().min(1),
  openingBalance: money,
  currentBalance: money,
  isActive: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createBankAccountRequestSchema = z
  .object({
    accountName: z.string().min(1),
    accountNumber: z.string().min(1),
    bankName: z.string().min(1),
    accountType,
    currency: z.string().min(1).optional(),
    openingBalance: money.optional(),
    currentBalance: money.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateBankAccountRequestSchema = createBankAccountRequestSchema.partial();

export const bankAccountListResponseSchema = z.object({
  bankAccounts: z.array(bankAccountSchema),
});

export const bankTransactionSchema = z.object({
  id: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  transactionDate: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().nullable(),
  amount: money,
  type: transactionType,
  balance: money.nullable(),
  category: z.string().nullable(),
  merchant: z.string().nullable(),
  isReconciled: z.boolean(),
  notes: z.string().nullable(),
  source: transactionSource,
  paymentMethod: paymentMethod.nullable(),
  counterparty: z.string().nullable(),
  transferId: z.string().uuid().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const importBankTransactionInputSchema = z.object({
  transactionDate: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().nullable().optional(),
  amount: money,
  type: transactionType,
  balance: money.nullable().optional(),
  category: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
});

export const importBankTransactionsRequestSchema = z
  .object({
    bankAccountId: z.string().uuid(),
    fileName: z.string().min(1).optional(),
    fileType: z.enum(['csv', 'ofx', 'qif', 'pdf']).optional(),
    skipDuplicates: z.boolean().optional(),
    transactions: z.array(importBankTransactionInputSchema).min(1),
  })
  .strict();

export const bankTransactionListResponseSchema = z.object({
  transactions: z.array(bankTransactionSchema),
});

export const importBankTransactionsResponseSchema = z.object({
  importedCount: z.number().int().nonnegative(),
  duplicatesSkipped: z.number().int().nonnegative(),
  transactions: z.array(bankTransactionSchema),
});

export const createBankTransactionRequestSchema = z
  .object({
    bankAccountId: z.string().uuid(),
    transactionDate: dateOnly,
    description: z.string().trim().min(1),
    reference: z.string().trim().min(1).nullable().optional(),
    amount: positiveMoney,
    type: transactionType,
    category: z.string().trim().min(1).nullable().optional(),
    counterparty: z.string().trim().min(1).nullable().optional(),
    paymentMethod: paymentMethod.nullable().optional(),
    notes: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const updateBankTransactionRequestSchema = createBankTransactionRequestSchema
  .omit({ bankAccountId: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, { message: 'At least one field is required' });

export const createBankTransferRequestSchema = z
  .object({
    sourceAccountId: z.string().uuid(),
    destinationAccountId: z.string().uuid(),
    transactionDate: dateOnly,
    amount: positiveMoney,
    description: z.string().trim().min(1).optional(),
    reference: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const bankTransferSchema = z.object({
  id: z.string().uuid(),
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  transactionDate: dateOnly,
  amount: money,
  currency: z.string().min(1),
  description: z.string().min(1),
  reference: z.string().nullable(),
  sourceTransaction: bankTransactionSchema,
  destinationTransaction: bankTransactionSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type BankAccountDto = z.infer<typeof bankAccountSchema>;
export type CreateBankAccountRequest = z.infer<typeof createBankAccountRequestSchema>;
export type UpdateBankAccountRequest = z.infer<typeof updateBankAccountRequestSchema>;
export type BankAccountListResponse = z.infer<typeof bankAccountListResponseSchema>;
export type BankTransactionDto = z.infer<typeof bankTransactionSchema>;
export type ImportBankTransactionsRequest = z.infer<typeof importBankTransactionsRequestSchema>;
export type BankTransactionListResponse = z.infer<typeof bankTransactionListResponseSchema>;
export type ImportBankTransactionsResponse = z.infer<typeof importBankTransactionsResponseSchema>;
export type CreateBankTransactionRequest = z.infer<typeof createBankTransactionRequestSchema>;
export type UpdateBankTransactionRequest = z.infer<typeof updateBankTransactionRequestSchema>;
export type CreateBankTransferRequest = z.infer<typeof createBankTransferRequestSchema>;
export type BankTransferDto = z.infer<typeof bankTransferSchema>;
