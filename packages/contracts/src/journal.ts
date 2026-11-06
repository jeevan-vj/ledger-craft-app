import { z } from 'zod';

const money = z.string().regex(/^\d+(\.\d+)?$/);
const journalStatus = z.enum(['draft', 'posted', 'reversed']);

export const journalEntryLineSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountName: z.string().min(1),
  debitAmount: money,
  creditAmount: money,
  description: z.string().nullable(),
  lineOrder: z.number().int(),
});

export const journalEntrySchema = z.object({
  id: z.string().uuid(),
  entryNumber: z.string().min(1),
  entryDate: z.string().min(1),
  description: z.string().min(1),
  referenceNumber: z.string().nullable(),
  debitAccountId: z.string().uuid(),
  debitAccountName: z.string().min(1),
  debitAmount: money,
  creditAccountId: z.string().uuid(),
  creditAccountName: z.string().min(1),
  creditAmount: money,
  // Optional so older clients/fixtures keep their two-account presentation.
  // Current API responses include every line and separate journal totals.
  lines: z.array(journalEntryLineSchema).optional(),
  debitTotal: money.optional(),
  creditTotal: money.optional(),
  status: journalStatus,
  notes: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const journalEntryListResponseSchema = z.object({
  journalEntries: z.array(journalEntrySchema),
});

export const createJournalEntryRequestSchema = z
  .object({
    description: z.string().min(1),
    entryDate: z.string().min(1),
    debitAccountId: z.string().uuid(),
    creditAccountId: z.string().uuid(),
    amount: money,
    referenceNumber: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict()
  .refine((value) => Number(value.amount) > 0, {
    message: 'Amount must be greater than 0',
    path: ['amount'],
  })
  .refine((value) => value.debitAccountId !== value.creditAccountId, {
    message: 'Debit and credit accounts must differ',
    path: ['creditAccountId'],
  });

export const updateJournalEntryRequestSchema = z
  .object({
    // A journal can only become `reversed` through a posted counter entry;
    // flipping a draft straight to reversed would leave no reversing journal.
    status: z.enum(['draft', 'posted']).optional(),
  })
  .strict();

export type JournalEntryDto = z.infer<typeof journalEntrySchema>;
export type JournalEntryLineDto = z.infer<typeof journalEntryLineSchema>;
export type JournalEntryListResponse = z.infer<typeof journalEntryListResponseSchema>;
export type CreateJournalEntryRequest = z.infer<typeof createJournalEntryRequestSchema>;
export type UpdateJournalEntryRequest = z.infer<typeof updateJournalEntryRequestSchema>;
