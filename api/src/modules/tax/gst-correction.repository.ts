import { and, asc, eq, inArray } from 'drizzle-orm';
import type { GstCorrectionSourceType } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { creditNotes } from '../../db/schema/credit-notes';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { payments } from '../../db/schema/payments';
import { billPayments, bills } from '../../db/schema/purchases';
import { customsGstEntries, gstCorrectionEvents, gstPeriodCorrections, taxReturns } from '../../db/schema/tax';
import { customsClaimDate } from './gst-return-boxes';
import { gstLockApplies, gstSnapshotBasis, type GstBasis, type GstLockKind } from './gst-period-lock';

export type GstCorrectionRow = typeof gstPeriodCorrections.$inferSelect;
type Actor = { organisationId: string; userId: string };
export type CorrectionInsert = {
  originalTaxReturnId: string;
  originalPeriodStart: string;
  originalPeriodEnd: string;
  targetPeriodStart: string;
  targetPeriodEnd: string;
  sourceType: GstCorrectionSourceType;
  sourceId: string;
  action: 'added' | 'changed' | 'voided';
  kind: 'output' | 'input';
  amount: string;
  reason: string;
};

type SourceHit = { date: string; kind: GstLockKind };

export async function correctionSourceDate(tx: Database, organisationId: string, basis: GstBasis, sourceType: GstCorrectionSourceType, sourceId: string): Promise<SourceHit | null> {
  if (sourceType === 'invoice') {
    const [row] = await tx.select({ date: invoices.date }).from(invoices).where(and(eq(invoices.organisationId, organisationId), eq(invoices.id, sourceId)));
    return row ? { date: row.date, kind: 'sales_document' } : null;
  }
  if (sourceType === 'bill') {
    const [row] = await tx.select({ date: bills.issueDate }).from(bills).where(and(eq(bills.organisationId, organisationId), eq(bills.id, sourceId)));
    return row ? { date: row.date, kind: 'purchase_document' } : null;
  }
  if (sourceType === 'expense') {
    const [row] = await tx.select({ date: expenses.expenseDate }).from(expenses).where(and(eq(expenses.organisationId, organisationId), eq(expenses.id, sourceId)));
    return row ? { date: row.date, kind: 'expense' } : null;
  }
  if (sourceType === 'credit_note') {
    const [row] = await tx.select({ date: creditNotes.issueDate }).from(creditNotes).where(and(eq(creditNotes.organisationId, organisationId), eq(creditNotes.id, sourceId)));
    return row ? { date: row.date, kind: 'credit_note' } : null;
  }
  if (sourceType === 'payment') {
    const [row] = await tx.select({ date: payments.paymentDate }).from(payments).where(and(eq(payments.organisationId, organisationId), eq(payments.id, sourceId)));
    return row ? { date: row.date, kind: 'customer_settlement' } : null;
  }
  if (sourceType === 'bill_payment') {
    const [row] = await tx.select({ date: billPayments.paymentDate }).from(billPayments).where(and(eq(billPayments.organisationId, organisationId), eq(billPayments.id, sourceId)));
    return row ? { date: row.date, kind: 'supplier_settlement' } : null;
  }
  const [row] = await tx.select({ invoiceDate: customsGstEntries.invoiceDate, paymentDate: customsGstEntries.paymentDate, status: customsGstEntries.status }).from(customsGstEntries)
    .where(and(eq(customsGstEntries.organisationId, organisationId), eq(customsGstEntries.id, sourceId)));
  if (!row || row.status !== 'open') return null;
  const date = customsClaimDate(basis, row.invoiceDate, row.paymentDate);
  if (!date) return { date: '', kind: basis === 'invoice' ? 'purchase_document' : 'supplier_settlement' };
  return { date, kind: basis === 'invoice' ? 'purchase_document' : 'supplier_settlement' };
}

export function sourceApplies(basis: GstBasis, hit: SourceHit): boolean {
  return Boolean(hit.date) && gstLockApplies(basis, hit.kind);
}

export async function pendingDuplicate(tx: Database, organisationId: string, input: Pick<CorrectionInsert, 'originalTaxReturnId' | 'sourceType' | 'sourceId' | 'kind' | 'action' | 'amount'>): Promise<string | undefined> {
  const [row] = await tx.select({ id: gstPeriodCorrections.id }).from(gstPeriodCorrections).where(and(
    eq(gstPeriodCorrections.organisationId, organisationId),
    eq(gstPeriodCorrections.originalTaxReturnId, input.originalTaxReturnId),
    eq(gstPeriodCorrections.sourceType, input.sourceType),
    eq(gstPeriodCorrections.sourceId, input.sourceId),
    eq(gstPeriodCorrections.kind, input.kind),
    eq(gstPeriodCorrections.action, input.action),
    eq(gstPeriodCorrections.amount, input.amount),
    eq(gstPeriodCorrections.status, 'pending'),
  ));
  return row?.id;
}

export async function insertCorrection(tx: Database, ctx: Actor, input: CorrectionInsert): Promise<GstCorrectionRow> {
  const [row] = await tx.insert(gstPeriodCorrections).values({
    organisationId: ctx.organisationId, actorId: ctx.userId, ...input, status: 'pending', createdAt: new Date(),
  }).returning();
  if (!row) throw new Error('Failed to record GST correction');
  await insertEvent(tx, ctx, row.id, 'recorded', input.reason);
  return row;
}

export async function insertEvent(tx: Database, ctx: Actor, correctionId: string, action: 'recorded' | 'included' | 'resolved' | 'withdrawn', reason: string) {
  await tx.insert(gstCorrectionEvents).values({ organisationId: ctx.organisationId, correctionId, actorId: ctx.userId, action, reason });
}

export async function listCorrectionsForTarget(tx: Database, organisationId: string, from: string, to: string): Promise<GstCorrectionRow[]> {
  return tx.select().from(gstPeriodCorrections).where(and(
    eq(gstPeriodCorrections.organisationId, organisationId),
    eq(gstPeriodCorrections.targetPeriodStart, from),
    eq(gstPeriodCorrections.targetPeriodEnd, to),
  )).orderBy(asc(gstPeriodCorrections.createdAt), asc(gstPeriodCorrections.id));
}

export async function getCorrection(tx: Database, organisationId: string, id: string): Promise<GstCorrectionRow | undefined> {
  const [row] = await tx.select().from(gstPeriodCorrections).where(and(eq(gstPeriodCorrections.organisationId, organisationId), eq(gstPeriodCorrections.id, id)));
  return row;
}

export async function inForceFiledReturns(tx: Database, organisationId: string) {
  const rows = await tx.select({
    id: taxReturns.id, periodStart: taxReturns.periodStart, periodEnd: taxReturns.periodEnd,
    status: taxReturns.status, returnType: taxReturns.returnType, supersededAt: taxReturns.supersededAt, returnData: taxReturns.returnData,
  }).from(taxReturns).where(eq(taxReturns.organisationId, organisationId));
  return rows.filter((row) => row.returnType === 'GST' && (row.status === 'submitted' || row.status === 'approved') && !row.supersededAt)
    .map((row) => ({ id: row.id, periodStart: row.periodStart, periodEnd: row.periodEnd, basis: gstSnapshotBasis(row.returnData) }));
}

export async function resolveCorrection(tx: Database, ctx: Actor, id: string, reason: string): Promise<GstCorrectionRow | undefined> {
  const [row] = await tx.update(gstPeriodCorrections).set({ status: 'resolved', resolution: 'amend_in_myir', resolvedAt: new Date() })
    .where(and(eq(gstPeriodCorrections.organisationId, ctx.organisationId), eq(gstPeriodCorrections.id, id), eq(gstPeriodCorrections.status, 'pending')))
    .returning();
  if (row) await insertEvent(tx, ctx, id, 'resolved', reason);
  return row;
}

export async function includeCorrections(tx: Database, ctx: Actor, taxReturnId: string, ids: string[]) {
  if (!ids.length) return;
  const updated = await tx.update(gstPeriodCorrections).set({ status: 'included', includedTaxReturnId: taxReturnId })
    .where(and(eq(gstPeriodCorrections.organisationId, ctx.organisationId), inArray(gstPeriodCorrections.id, ids), eq(gstPeriodCorrections.status, 'pending')))
    .returning({ id: gstPeriodCorrections.id });
  for (const row of updated) await insertEvent(tx, ctx, row.id, 'included', `Included in GST return ${taxReturnId}`);
}

export async function withdrawPendingForReturn(tx: Database, ctx: Actor, originalTaxReturnId: string, reason: string) {
  const pending = await tx.select({ id: gstPeriodCorrections.id }).from(gstPeriodCorrections).where(and(
    eq(gstPeriodCorrections.organisationId, ctx.organisationId),
    eq(gstPeriodCorrections.originalTaxReturnId, originalTaxReturnId),
    eq(gstPeriodCorrections.status, 'pending'),
  ));
  if (!pending.length) return;
  await tx.update(gstPeriodCorrections).set({ status: 'withdrawn', resolvedAt: new Date() }).where(and(
    eq(gstPeriodCorrections.organisationId, ctx.organisationId),
    eq(gstPeriodCorrections.originalTaxReturnId, originalTaxReturnId),
    eq(gstPeriodCorrections.status, 'pending'),
  ));
  for (const row of pending) await insertEvent(tx, ctx, row.id, 'withdrawn', reason);
}

export async function correctionEvents(tx: Database, organisationId: string, correctionId: string) {
  return tx.select({ action: gstCorrectionEvents.action, reason: gstCorrectionEvents.reason, actorId: gstCorrectionEvents.actorId })
    .from(gstCorrectionEvents)
    .where(and(eq(gstCorrectionEvents.organisationId, organisationId), eq(gstCorrectionEvents.correctionId, correctionId)))
    .orderBy(asc(gstCorrectionEvents.createdAt));
}
