import { z } from 'zod';
import { positiveAmountAtMostTwoDecimals } from './positive-amount';

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
export const bookItemType = z.enum(['invoice', 'bill', 'payment', 'expense']);
export const bankSuggestionTypeSchema = z.enum(['invoice', 'bill', 'expense', 'matching_rule']);
export const matchingRuleDirectionSchema = z.enum(['debit', 'credit', 'any']);

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
  billId: z.string().uuid().nullable().default(null),
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

export const bankTransactionSuggestionSchema = z.object({
  id: z.string().uuid(),
  type: bankSuggestionTypeSchema,
  date: z.string().nullable(),
  description: z.string().min(1),
  reference: z.string().nullable(),
  counterparty: z.string().nullable(),
  amount: money.nullable(),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().min(1)).min(1),
  matchingRuleId: z.string().uuid().nullable(),
  targetAccountId: z.string().uuid().nullable(),
  contactId: z.string().uuid().nullable(),
});

export const bankTransactionSuggestionResponseSchema = z.object({
  transactionId: z.string().uuid(),
  suggestions: z.array(bankTransactionSuggestionSchema),
});

export const bankTransactionSuggestionBatchRequestSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(100),
}).strict();

export const bankTransactionSuggestionBatchResponseSchema = z.object({
  items: z.array(bankTransactionSuggestionResponseSchema),
});

const reconciliationAllocationSchema = z.object({
  documentType: z.enum(['invoice', 'bill']),
  documentId: z.string().uuid(),
  amount: positiveAmountAtMostTwoDecimals,
}).strict();

const reconciliationSplitSchema = z.object({
  accountId: z.string().uuid(),
  amount: positiveAmountAtMostTwoDecimals,
  description: z.string().trim().min(1).max(255).optional(),
}).strict();

export const acceptBankTransactionSuggestionRequestSchema = z.object({
  allocations: z.array(reconciliationAllocationSchema).max(50).default([]),
  splits: z.array(reconciliationSplitSchema).max(50).default([]),
  bankFee: positiveAmountAtMostTwoDecimals.optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference: z.string().trim().min(1).max(255).nullable().optional(),
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
}).strict().refine((input) => input.allocations.length > 0 || input.splits.length > 0 || input.bankFee !== undefined, {
  message: 'At least one allocation, split, or bank fee is required',
});

export const undoBankTransactionReconciliationRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  reversalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const markBankTransactionPersonalRequestSchema = z.object({
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
}).strict();

export const bankReconciliationActionSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
  actionType: z.enum(['accept', 'personal']),
  journalEntryId: z.string().uuid(),
  status: z.enum(['active', 'reversed']),
  paymentIds: z.array(z.string().uuid()),
  billPaymentIds: z.array(z.string().uuid()),
  createdAt: z.string().min(1),
  reversedAt: z.string().nullable(),
});

export const bankMatchingRuleSchema = z.object({
  id: z.string().uuid(),
  descriptionContains: z.string().min(1),
  amountMin: money.nullable(),
  amountMax: money.nullable(),
  direction: matchingRuleDirectionSchema,
  targetAccountId: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  enabled: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createBankMatchingRuleRequestSchema = z.object({
  descriptionContains: z.string().trim().min(1).max(255),
  amountMin: money.nullable().optional(),
  amountMax: money.nullable().optional(),
  direction: matchingRuleDirectionSchema.default('any'),
  targetAccountId: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(true),
}).strict();

export const updateBankMatchingRuleRequestSchema = createBankMatchingRuleRequestSchema.partial()
  .refine((input) => Object.keys(input).length > 0, { message: 'At least one field is required' });

export const bankMatchingRuleListResponseSchema = z.object({ rules: z.array(bankMatchingRuleSchema) });

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
export type BankTransactionSuggestion = z.infer<typeof bankTransactionSuggestionSchema>;
export type BankTransactionSuggestionResponse = z.infer<typeof bankTransactionSuggestionResponseSchema>;
export type BankTransactionSuggestionBatchRequest = z.infer<typeof bankTransactionSuggestionBatchRequestSchema>;
export type AcceptBankTransactionSuggestionRequest = z.infer<typeof acceptBankTransactionSuggestionRequestSchema>;
export type UndoBankTransactionReconciliationRequest = z.infer<typeof undoBankTransactionReconciliationRequestSchema>;
export type MarkBankTransactionPersonalRequest = z.infer<typeof markBankTransactionPersonalRequestSchema>;
export type BankReconciliationActionDto = z.infer<typeof bankReconciliationActionSchema>;
export type BankMatchingRuleDto = z.infer<typeof bankMatchingRuleSchema>;
export type CreateBankMatchingRuleRequest = z.infer<typeof createBankMatchingRuleRequestSchema>;
export type UpdateBankMatchingRuleRequest = z.infer<typeof updateBankMatchingRuleRequestSchema>;
