import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Must be a real calendar date');
const money = z.string().max(25).regex(/^\d+(?:\.\d{1,2})?$/);
export const recoveryLineSchema = z.object({ accountId: z.string().min(1), debit: money, credit: money }).strict();
export const openingBalancesRequestSchema = z.object({
  date, reference: z.string().trim().min(1).max(200), reviewed: z.literal(true),
  lines: z.array(recoveryLineSchema).min(2).max(200),
}).strict();
export const openingBalancesResponseSchema = z.object({ journalEntryId: z.string(), date, reference: z.string(), total: money, replayed: z.boolean() }).strict();
export const ledgerAuditFindingSchema = z.object({
  key: z.string(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  type: z.enum(['supplier_bank', 'expense_gst', 'duplicate_bank_posting']),
  sourceId: z.string(), sourceJournalId: z.string(), sourceDate: date,
  description: z.string(), requiresReceiptConfirmation: z.boolean(), actual: z.record(z.string()), expected: z.record(z.string()),
  correctionLines: z.array(recoveryLineSchema),
}).strict();
export const ledgerAuditResponseSchema = z.object({ findings: z.array(ledgerAuditFindingSchema), warnings: z.array(z.string()) }).strict();
export const applyLedgerAuditRequestSchema = z.object({
  date, reason: z.string().trim().min(1).max(500), reviewed: z.literal(true),
  findings: z.array(z.object({ key: z.string().min(1), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), receiptGstConfirmed: z.literal(true).optional() }).strict()).min(1).max(200),
}).strict();
export const applyLedgerAuditResponseSchema = z.object({ corrections: z.array(z.object({ key: z.string(), journalEntryId: z.string(), replayed: z.boolean() }).strict()) }).strict();
export type OpeningBalancesRequest = z.infer<typeof openingBalancesRequestSchema>;
export type OpeningBalancesResponse = z.infer<typeof openingBalancesResponseSchema>;
export type LedgerAuditFinding = z.infer<typeof ledgerAuditFindingSchema>;
export type LedgerAuditResponse = z.infer<typeof ledgerAuditResponseSchema>;
export type ApplyLedgerAuditRequest = z.infer<typeof applyLedgerAuditRequestSchema>;
export type ApplyLedgerAuditResponse = z.infer<typeof applyLedgerAuditResponseSchema>;
