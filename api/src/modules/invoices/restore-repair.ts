import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { journalEntries } from '../../db/schema/accounts';
import { invoices } from '../../db/schema/invoices';
import { organisationToday } from '../accounting/organisation-date';
import { postInvoiceRestoreJournal } from './invoices.journal';

export type RestoreRepairCandidate = {
  organisationId: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  cancellations: number;
  restores: number;
  missingRestores: number;
};

export type RestoreRepairResult = { candidates: RestoreRepairCandidate[]; applied: boolean; journalsPosted: number };

/**
 * Finds active (non-draft, non-cancelled) invoices whose cancellation journals
 * outnumber their restore journals. Before the restore-cycle fix a second
 * cancel/restore cycle skipped the restore journal, leaving an active invoice
 * with a zero net ledger (no receivable, revenue or output GST).
 */
export async function findInvoicesMissingRestoreJournals(db: Database): Promise<RestoreRepairCandidate[]> {
  const lifecycleEntries = await db.select({
    organisationId: journalEntries.organisationId,
    invoiceId: journalEntries.referenceId,
    referenceType: journalEntries.referenceType,
  }).from(journalEntries).where(inArray(journalEntries.referenceType, ['invoice_cancellation', 'invoice_restore']));
  const counts = new Map<string, { organisationId: string; cancellations: number; restores: number }>();
  for (const entry of lifecycleEntries) {
    if (!entry.invoiceId) continue;
    const current = counts.get(entry.invoiceId) ?? { organisationId: entry.organisationId, cancellations: 0, restores: 0 };
    if (entry.referenceType === 'invoice_cancellation') current.cancellations++;
    else current.restores++;
    counts.set(entry.invoiceId, current);
  }
  const owing = [...counts].filter(([, count]) => count.cancellations > count.restores).map(([invoiceId]) => invoiceId);
  if (!owing.length) return [];
  const active = await db.select({
    id: invoices.id, organisationId: invoices.organisationId, invoiceNumber: invoices.invoiceNumber, status: invoices.status,
  }).from(invoices).where(and(inArray(invoices.id, owing), notInArray(invoices.status, ['draft', 'cancelled'])));
  return active.map((invoice) => {
    const count = counts.get(invoice.id)!;
    return {
      organisationId: invoice.organisationId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      cancellations: count.cancellations,
      restores: count.restores,
      missingRestores: count.cancellations - count.restores,
    };
  }).sort((a, b) => a.organisationId.localeCompare(b.organisationId) || a.invoiceNumber.localeCompare(b.invoiceNumber));
}

/**
 * Dry-run by default. With `apply`, posts the missing restore journals (dated
 * the organisation's local today) inside one transaction per invoice. Safe to
 * re-run: `postInvoiceRestoreJournal` only posts while cancellations outnumber
 * restores, so a second run finds and posts nothing.
 */
export async function repairInvoiceRestoreJournals(db: Database, options: { apply?: boolean } = {}): Promise<RestoreRepairResult> {
  const candidates = await findInvoicesMissingRestoreJournals(db);
  if (!options.apply) return { candidates, applied: false, journalsPosted: 0 };
  let journalsPosted = 0;
  for (const candidate of candidates) {
    journalsPosted += await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Database;
      const [invoice] = await tx.select().from(invoices).where(and(
        eq(invoices.organisationId, candidate.organisationId), eq(invoices.id, candidate.invoiceId),
      ));
      if (!invoice || invoice.status === 'draft' || invoice.status === 'cancelled') return 0;
      const ctx = { organisationId: invoice.organisationId, userId: invoice.userId };
      const date = await organisationToday(tx, invoice.organisationId);
      let posted = 0;
      while (await postInvoiceRestoreJournal(tx, ctx, { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, date, total: invoice.total })) posted++;
      return posted;
    });
  }
  return { candidates, applied: true, journalsPosted };
}
