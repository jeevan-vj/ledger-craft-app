import { creditNoteSchema, type CreditNoteDto } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts, journalEntries } from '../../db/schema/accounts';
import { creditNotes, creditNoteLines, creditNoteRefunds } from '../../db/schema/credit-notes';
import { invoices } from '../../db/schema/invoices';
import { payments } from '../../db/schema/payments';
import { decimal, roundMoney } from '../invoices/money';

export async function hasActiveCreditNotes(tx: Database, organisationId: string, invoiceId: string): Promise<boolean> {
  const [row] = await tx.select({ id: creditNotes.id }).from(creditNotes).where(and(eq(creditNotes.organisationId, organisationId), eq(creditNotes.invoiceId, invoiceId), eq(creditNotes.status, 'issued'))).limit(1);
  return !!row;
}
export async function latestActiveCreditNoteDate(tx: Database, organisationId: string, invoiceId: string): Promise<string | undefined> {
  const [row] = await tx.select({ date: creditNotes.issueDate }).from(creditNotes).where(and(eq(creditNotes.organisationId, organisationId), eq(creditNotes.invoiceId, invoiceId), eq(creditNotes.status, 'issued'))).orderBy(desc(creditNotes.issueDate)).limit(1);
  return row?.date;
}
export async function note(tx: Database, organisationId: string, id: string): Promise<CreditNoteDto | undefined> {
  const [row] = await tx.select().from(creditNotes).where(and(eq(creditNotes.organisationId, organisationId), eq(creditNotes.id, id)));
  if (!row) return undefined;
  const [items, refunds] = await Promise.all([
    tx.select().from(creditNoteLines).where(and(eq(creditNoteLines.organisationId, organisationId), eq(creditNoteLines.creditNoteId, id))).orderBy(asc(creditNoteLines.lineOrder)),
    tx.select().from(creditNoteRefunds).where(and(eq(creditNoteRefunds.organisationId, organisationId), eq(creditNoteRefunds.creditNoteId, id))).orderBy(asc(creditNoteRefunds.createdAt), asc(creditNoteRefunds.id)),
  ]);
  return creditNoteSchema.parse({ ...row, items: items.map(item => item.data), createdAt: row.createdAt.toISOString(), createdBy: row.userId,
    refundAvailable: row.status === 'reversed' ? '0.00' : roundMoney(decimal(row.customerCreditAmount).sub(row.refundedAmount)),
    refunds: refunds.map(refund => ({ ...refund, createdAt: refund.createdAt.toISOString(), createdBy: refund.userId })),
  });
}
export async function list(tx: Database, organisationId: string, invoiceId?: string): Promise<CreditNoteDto[]> {
  const conditions = [eq(creditNotes.organisationId, organisationId)]; if (invoiceId) conditions.push(eq(creditNotes.invoiceId, invoiceId));
  const rows = await tx.select({ id: creditNotes.id }).from(creditNotes).where(and(...conditions)).orderBy(desc(creditNotes.issueDate), desc(creditNotes.createdAt));
  const notes = await Promise.all(rows.map(row => note(tx, organisationId, row.id)));
  return notes.filter((value): value is CreditNoteDto => value !== undefined);
}
export async function insert(tx: Database, values: typeof creditNotes.$inferInsert, lines: unknown[]) {
  await tx.insert(creditNotes).values(values);
  if (lines.length) await tx.insert(creditNoteLines).values(lines.map((data, index) => ({ organisationId: values.organisationId, creditNoteId: values.id!, lineOrder: index, data })));
}
export async function update(tx: Database, organisationId: string, id: string, values: Partial<typeof creditNotes.$inferInsert>) {
  await tx.update(creditNotes).set({ ...values, updatedAt: new Date() }).where(and(eq(creditNotes.organisationId, organisationId), eq(creditNotes.id, id)));
}
export async function insertRefund(tx: Database, values: typeof creditNoteRefunds.$inferInsert) { await tx.insert(creditNoteRefunds).values(values); }
export async function reverseRefund(tx: Database, organisationId: string, id: string, date: string, reason: string) {
  await tx.update(creditNoteRefunds).set({ status: 'reversed', reversalDate: date, reversalReason: reason }).where(and(eq(creditNoteRefunds.organisationId, organisationId), eq(creditNoteRefunds.id, id)));
}
export async function updateInvoiceCredits(tx: Database, organisationId: string, invoiceId: string, input: { totalCredited: string; taxCredited: string; baseCredited: string; baseTaxCredited: string; balanceDue: string; status: string; paymentStatus: string }) {
  await tx.update(invoices).set({ ...input, updatedAt: new Date() }).where(and(eq(invoices.organisationId, organisationId), eq(invoices.id, invoiceId)));
}
export async function paidBookAmounts(tx: Database, organisationId: string, invoiceId: string) {
  return tx.select({ amount: payments.amount, bookBaseAmount: payments.bookBaseAmount, date: payments.paymentDate }).from(payments).where(and(eq(payments.organisationId, organisationId), eq(payments.invoiceId, invoiceId), eq(payments.status, 'completed')));
}
export async function sourcePosting(tx: Database, organisationId: string, invoiceId: string) {
  const [row] = await tx.select().from(journalEntries).where(and(eq(journalEntries.organisationId, organisationId), eq(journalEntries.referenceType, 'invoice'), eq(journalEntries.referenceId, invoiceId), eq(journalEntries.status, 'posted')));
  return row;
}
export async function customerCreditAccount(tx: Database, ctx: { organisationId: string; userId: string }) {
  const [existing] = await tx.select().from(accounts).where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.accountNumber, '2300')));
  if (existing) {
    if ((existing.accountClass ?? existing.type) !== 'liability' || (existing.normalBalance && existing.normalBalance !== 'credit') || !existing.isActive) throw new HTTPException(409, { message: 'Customer credit control account2300 must be an active credit-normal liability account' });
    return existing.id;
  }
  const [created] = await tx.insert(accounts).values({ organisationId: ctx.organisationId, userId: ctx.userId, accountNumber: '2300', name: 'Customer Credits', type: 'liability', accountClass: 'liability', normalBalance: 'credit' }).returning();
  if (!created) throw new Error('Could not create customer credit account'); return created.id;
}
export async function revenueAccount(tx: Database, organisationId: string) {
  const [row] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.organisationId, organisationId), eq(accounts.accountNumber, '4000')));
  if (!row) throw new Error('Source invoice revenue account missing'); return row.id;
}
