import { z } from 'zod';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const sessionStatus = z.enum(['in_progress', 'completed', 'locked']);
const matchType = z.enum([
  'auto_exact',
  'auto_fuzzy',
  'manual',
  'split',
  'combined',
  'unmatched_bank',
  'unmatched_book',
]);
const matchStatus = z.enum(['pending', 'confirmed', 'rejected', 'adjusted']);
const adjustmentType = z.enum([
  'outstanding_check',
  'deposit_in_transit',
  'bank_error',
  'book_error',
  'bank_fee',
  'interest_earned',
  'nsf_check',
  'other',
]);
const bookItemType = z.enum(['invoice', 'payment', 'expense']);

export const reconciliationSessionSchema = z.object({
  id: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  statementStartDate: z.string().min(1),
  statementEndDate: z.string().min(1),
  statementOpeningBalance: money,
  statementClosingBalance: money,
  bookOpeningBalance: money,
  bookClosingBalance: money.nullable(),
  totalDeposits: money,
  totalWithdrawals: money,
  status: sessionStatus,
  reconciledAt: z.string().nullable(),
  matchedCount: z.number().int(),
  unmatchedBankCount: z.number().int(),
  unmatchedBookCount: z.number().int(),
  adjustmentCount: z.number().int(),
  difference: money,
  notes: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createReconciliationSessionRequestSchema = z
  .object({
    bankAccountId: z.string().uuid(),
    statementStartDate: z.string().min(1),
    statementEndDate: z.string().min(1),
    statementOpeningBalance: money,
    statementClosingBalance: money,
    notes: z.string().nullable().optional(),
  })
  .strict();

export const reconciliationMatchSchema = z.object({
  id: z.string().uuid(),
  reconciliationId: z.string().uuid(),
  bankTransactionId: z.string().uuid().nullable(),
  invoiceId: z.string().uuid().nullable(),
  paymentId: z.string().uuid().nullable(),
  expenseId: z.string().uuid().nullable(),
  journalEntryId: z.string().uuid().nullable(),
  matchType,
  confidenceScore: z.number(),
  bankAmount: money.nullable(),
  bookAmount: money.nullable(),
  difference: money,
  status: matchStatus,
  notes: z.string().nullable(),
  matchedAt: z.string().min(1),
  createdAt: z.string().min(1),
});

export const createReconciliationMatchRequestSchema = z
  .object({
    bankTransactionId: z.string().uuid(),
    bookItemType,
    bookItemId: z.string().uuid(),
    matchType: matchType.optional(),
    confidenceScore: z.number().min(0).max(100).optional(),
    notes: z.string().nullable().optional(),
    status: matchStatus.optional(),
  })
  .strict();

export const confirmReconciliationMatchesRequestSchema = z
  .object({
    matches: z.array(createReconciliationMatchRequestSchema).min(1),
  })
  .strict();

export const reconciliationAdjustmentSchema = z.object({
  id: z.string().uuid(),
  reconciliationId: z.string().uuid(),
  adjustmentType,
  description: z.string().min(1),
  amount: money,
  affectsBank: z.boolean(),
  affectsBook: z.boolean(),
  referenceNumber: z.string().nullable(),
  status: z.enum(['pending', 'applied', 'reversed']),
  appliedAt: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createReconciliationAdjustmentRequestSchema = z
  .object({
    adjustmentType,
    description: z.string().min(1),
    amount: money,
    affectsBank: z.boolean(),
    affectsBook: z.boolean(),
    referenceNumber: z.string().nullable().optional(),
  })
  .strict();

export const bookEntrySchema = z.object({
  id: z.string().uuid(),
  type: bookItemType,
  date: z.string().min(1),
  description: z.string().min(1),
  amount: money,
  reference: z.string().nullable(),
});

export const reconciliationSessionListResponseSchema = z.object({
  sessions: z.array(reconciliationSessionSchema),
});

export const bookEntryListResponseSchema = z.object({
  entries: z.array(bookEntrySchema),
});

export type ReconciliationSessionDto = z.infer<typeof reconciliationSessionSchema>;
export type CreateReconciliationSessionRequest = z.infer<typeof createReconciliationSessionRequestSchema>;
export type ReconciliationMatchDto = z.infer<typeof reconciliationMatchSchema>;
export type CreateReconciliationMatchRequest = z.infer<typeof createReconciliationMatchRequestSchema>;
export type ConfirmReconciliationMatchesRequest = z.infer<typeof confirmReconciliationMatchesRequestSchema>;
export type ReconciliationAdjustmentDto = z.infer<typeof reconciliationAdjustmentSchema>;
export type CreateReconciliationAdjustmentRequest = z.infer<
  typeof createReconciliationAdjustmentRequestSchema
>;
export type BookEntryDto = z.infer<typeof bookEntrySchema>;
