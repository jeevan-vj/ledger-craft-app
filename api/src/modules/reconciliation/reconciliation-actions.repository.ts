import { bankReconciliationActionSchema, type BankReconciliationActionDto } from '@ledgercraft/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { bankReconciliationActionItems, bankReconciliationActions } from '../../db/schema/reconciliation-actions';
import { roundMoney } from '../invoices/money';

type ActionRow = typeof bankReconciliationActions.$inferSelect;

async function toDto(tx: Database, row: ActionRow): Promise<BankReconciliationActionDto> {
  const items = await tx.select().from(bankReconciliationActionItems).where(and(
    eq(bankReconciliationActionItems.organisationId, row.organisationId),
    eq(bankReconciliationActionItems.actionId, row.id),
  ));
  return bankReconciliationActionSchema.parse({
    id: row.id,
    transactionId: row.transactionId,
    actionType: row.actionType,
    journalEntryId: row.journalEntryId,
    status: row.status,
    paymentIds: items.flatMap((item) => item.paymentId ? [item.paymentId] : []),
    billPaymentIds: items.flatMap((item) => item.billPaymentId ? [item.billPaymentId] : []),
    createdAt: row.createdAt.toISOString(),
    reversedAt: row.reversedAt?.toISOString() ?? null,
  });
}

export async function getActiveAction(tx: Database, organisationId: string, transactionId: string) {
  const [row] = await tx.select().from(bankReconciliationActions).where(and(
    eq(bankReconciliationActions.organisationId, organisationId),
    eq(bankReconciliationActions.transactionId, transactionId),
    eq(bankReconciliationActions.status, 'active'),
  ));
  return row ? toDto(tx, row) : undefined;
}

export async function insertAction(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: { id?: string; transactionId: string; actionType: 'accept' | 'personal'; journalEntryId: string },
) {
  const [row] = await tx.insert(bankReconciliationActions).values({ ...input, organisationId: ctx.organisationId, userId: ctx.userId }).returning();
  if (!row) throw new Error('Failed to record reconciliation action');
  return row;
}

export async function insertActionItems(
  tx: Database,
  organisationId: string,
  actionId: string,
  items: Array<{ documentType: 'invoice' | 'bill'; documentId: string; paymentId: string | null; billPaymentId: string | null; amount: string }>,
) {
  if (!items.length) return;
  await tx.insert(bankReconciliationActionItems).values(items.map((item) => ({
    ...item, organisationId, actionId, amount: roundMoney(item.amount),
  })));
}

export async function listActionItems(tx: Database, organisationId: string, actionId: string) {
  return tx.select().from(bankReconciliationActionItems).where(and(
    eq(bankReconciliationActionItems.organisationId, organisationId),
    eq(bankReconciliationActionItems.actionId, actionId),
  ));
}

export async function markActionReversed(tx: Database, organisationId: string, id: string, reason: string) {
  const [row] = await tx.update(bankReconciliationActions).set({
    status: 'reversed', reversalReason: reason, reversedAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(bankReconciliationActions.organisationId, organisationId), eq(bankReconciliationActions.id, id))).returning();
  return row ? toDto(tx, row) : undefined;
}
