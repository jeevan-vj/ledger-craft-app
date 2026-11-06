import { and, desc, eq, gte, like } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts, journalEntries } from '../../db/schema/accounts';
import { payments } from '../../db/schema/payments';
import { billPayments } from '../../db/schema/purchases';

export async function sourcePostingTotal(tx: Database, organisationId: string, type: 'invoice' | 'bill', id: string) {
  const [row] = await tx.select({ total: journalEntries.totalAmount }).from(journalEntries).where(and(
    eq(journalEntries.organisationId, organisationId), eq(journalEntries.referenceType, type), eq(journalEntries.referenceId, id),
  ));
  return row?.total;
}

export async function completedSettlementAmounts(tx: Database, organisationId: string, type: 'invoice' | 'bill', id: string) {
  if (type === 'invoice') return tx.select({ amount: payments.amount, bookBaseAmount: payments.bookBaseAmount }).from(payments).where(and(
    eq(payments.organisationId, organisationId), eq(payments.invoiceId, id), eq(payments.status, 'completed'),
  ));
  return tx.select({ amount: billPayments.amount, bookBaseAmount: billPayments.bookBaseAmount }).from(billPayments).where(and(
    eq(billPayments.organisationId, organisationId), eq(billPayments.billId, id), eq(billPayments.status, 'completed'),
  ));
}

export async function exchangeAccount(tx: Database, ctx: { organisationId: string; userId: string }, gain: boolean) {
  const code = gain ? '4200' : '5200';
  const [existing] = await tx.select({ id: accounts.id, accountClass: accounts.accountClass, normalBalance: accounts.normalBalance, isActive: accounts.isActive }).from(accounts).where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.accountNumber, code)));
  if (existing) return existing.accountClass === (gain ? 'revenue' : 'expense') && existing.normalBalance === (gain ? 'credit' : 'debit') && existing.isActive ? existing.id : null;
  const [row] = await tx.insert(accounts).values({
    organisationId: ctx.organisationId, userId: ctx.userId, accountNumber: code,
    name: gain ? 'Realized Foreign Exchange Gain' : 'Realized Foreign Exchange Loss',
    type: gain ? 'revenue' : 'expense', accountClass: gain ? 'revenue' : 'expense', normalBalance: gain ? 'credit' : 'debit',
  }).returning({ id: accounts.id });
  if (!row) throw new Error('Could not create exchange account');
  return row.id;
}

export async function closedRevaluationDate(tx: Database, organisationId: string, type: 'invoice' | 'bill', id: string, paymentDate: string) {
  const [row] = await tx.select({ date: journalEntries.entryDate }).from(journalEntries).where(and(
    eq(journalEntries.organisationId, organisationId), eq(journalEntries.referenceType, 'fx_revaluation'),
    like(journalEntries.referenceId, `%:${type}:${id}`), gte(journalEntries.entryDate, paymentDate),
  )).orderBy(desc(journalEntries.entryDate)).limit(1);
  return row?.date;
}
