import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { payments } from '../../db/schema/payments';
import { stripePaymentLinks, stripeVerifications } from '../../db/schema/stripe';
import { decimal, roundMoney } from '../invoices/money';

export async function paymentLink(db: Database, organisationId: string, paymentId: string) {
  const [link] = await db.select().from(stripePaymentLinks).where(and(eq(stripePaymentLinks.organisationId, organisationId), eq(stripePaymentLinks.paymentId, paymentId)));
  if (!link) return undefined;
  const [payment] = await db.select().from(payments).where(and(eq(payments.organisationId, organisationId), eq(payments.id, paymentId)));
  return payment ? { link, payment } : undefined;
}
export async function linkByIntent(db: Database, intentId: string) {
  const [link] = await db.select().from(stripePaymentLinks).where(eq(stripePaymentLinks.stripePaymentIntentId, intentId)); return link;
}
export async function record(db: Database, input: typeof stripeVerifications.$inferInsert) {
  const [row] = await db.insert(stripeVerifications).values(input).returning(); return row;
}
export function list(db: Database, organisationId: string) {
  return db.select().from(stripeVerifications).where(eq(stripeVerifications.organisationId, organisationId)).orderBy(desc(stripeVerifications.createdAt)).limit(100);
}
export async function clearingBalance(db: Database, organisationId: string) {
  const rows = await db.select({ debit: journalEntryLines.debitAmount, credit: journalEntryLines.creditAmount })
    .from(journalEntryLines).innerJoin(journalEntries, and(eq(journalEntries.organisationId, journalEntryLines.organisationId), eq(journalEntries.id, journalEntryLines.journalEntryId)))
    .innerJoin(accounts, and(eq(accounts.organisationId, journalEntryLines.organisationId), eq(accounts.id, journalEntryLines.accountId)))
    .where(and(eq(accounts.organisationId, organisationId), eq(accounts.accountNumber, '1130'), inArray(journalEntries.status, ['posted', 'reversed'])));
  return roundMoney(rows.reduce((value, row) => value.add(row.debit).sub(row.credit), decimal(0)));
}
export function settlements(db: Database, organisationId: string) {
  return db.select({ id: payments.id, amount: payments.amount, status: payments.status, invoiceId: payments.invoiceId, paymentDate: payments.paymentDate, platformFee: stripePaymentLinks.platformFee })
    .from(stripePaymentLinks).innerJoin(payments, and(eq(payments.organisationId, stripePaymentLinks.organisationId), eq(payments.id, stripePaymentLinks.paymentId)))
    .where(eq(stripePaymentLinks.organisationId, organisationId)).orderBy(desc(payments.createdAt)).limit(100);
}
