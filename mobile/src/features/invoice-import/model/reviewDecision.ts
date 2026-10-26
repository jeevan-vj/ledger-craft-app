import type { InvoiceImportDraftResponse } from '@ledgercraft/contracts';

export type CommitDecision = { canCommit: boolean; reasons: string[] };

/** Client explanation only. The Hono commit endpoint remains authoritative. */
export function commitDecision(review: InvoiceImportDraftResponse, duplicatesAcknowledged: boolean): CommitDecision {
  const reasons: string[] = [];
  if (!review.direction) reasons.push('Choose Sales income or Purchase / expense.');
  if (!review.contactId) reasons.push('Choose a customer or vendor.');
  if (review.duplicateWarnings.length > 0 && !duplicatesAcknowledged) reasons.push('Acknowledge the possible duplicate.');
  if (review.validationIssues.some((issue) => issue.blocking)) reasons.push('Correct the totals mismatch before creating the draft.');
  return { canCommit: reasons.length === 0, reasons };
}
