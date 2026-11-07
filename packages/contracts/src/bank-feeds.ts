import { z } from 'zod';
export const bankFeedAccountSchema = z.object({
  id: z.string(), bankAccountId: z.string().uuid(), name: z.string(), institution: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']), currency: z.string(), lastSyncedAt: z.string().nullable(),
});
export const bankFeedSummarySchema = z.object({
  mode: z.enum(['personal', 'unavailable']), fullAppAvailable: z.literal(false),
  status: z.enum(['not_connected','connected','revoked','disconnected']),
  lastAttemptAt: z.string().nullable(), lastSyncedAt: z.string().nullable(), nextSyncAt: z.string().nullable(),
  accounts: z.array(bankFeedAccountSchema), warnings: z.array(z.string()),
});
export const bankFeedSyncResultSchema = z.object({ imported: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), summary: bankFeedSummarySchema });
export const bankFeedDisconnectSchema = z.object({ retainAccountingRecords: z.literal(true), confirmation: z.literal('Disconnect Akahu') }).strict();
export type BankFeedSummary = z.infer<typeof bankFeedSummarySchema>;
export type BankFeedSyncResult = z.infer<typeof bankFeedSyncResultSchema>;
