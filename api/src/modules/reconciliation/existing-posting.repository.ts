import { and, eq, gte, inArray, lt, lte, or } from 'drizzle-orm';
import type { CreateReconciliationMatchRequest } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { reconciliationMatches, reconciliationSessions } from '../../db/schema/reconciliation';
import { decimal, roundMoney } from '../invoices/money';

export async function bankLedgerBalance(tx: Database, organisationId: string, bankId: string, date: string, before = false) {
  const rows = await tx.select({ debit: journalEntryLines.debitAmount, credit: journalEntryLines.creditAmount })
    .from(journalEntryLines).innerJoin(journalEntries, and(eq(journalEntries.id, journalEntryLines.journalEntryId), eq(journalEntries.organisationId, organisationId)))
    .innerJoin(accounts, and(eq(accounts.id, journalEntryLines.accountId), eq(accounts.organisationId, organisationId)))
    .where(and(eq(journalEntryLines.organisationId, organisationId), inArray(journalEntries.status, ['posted', 'reversed']),
      eq(accounts.accountNumber, `BANK-${bankId.slice(0, 8).toUpperCase()}`),
      before ? lt(journalEntries.entryDate, date) : lte(journalEntries.entryDate, date)));
  return { hasEntries: rows.length > 0, balance: roundMoney(rows.reduce((sum, row) => sum.add(row.debit).sub(row.credit), decimal(0))) };
}

export async function hasCompletedStatement(tx: Database, organisationId: string, bankId: string, date: string) {
  const rows = await tx.select({ id: reconciliationSessions.id }).from(reconciliationSessions).where(and(
    eq(reconciliationSessions.organisationId, organisationId), eq(reconciliationSessions.bankAccountId, bankId),
    inArray(reconciliationSessions.status, ['completed', 'locked']),
    lte(reconciliationSessions.statementStartDate, date), gte(reconciliationSessions.statementEndDate, date),
  ));
  return rows.length > 0;
}

export async function confirmedMatches(tx: Database, organisationId: string, input: CreateReconciliationMatchRequest) {
  return tx.select().from(reconciliationMatches).where(and(
    eq(reconciliationMatches.organisationId, organisationId), eq(reconciliationMatches.status, 'confirmed'),
    or(eq(reconciliationMatches.bankTransactionId, input.bankTransactionId),
      eq(input.bookItemType === 'payment' ? reconciliationMatches.paymentId : reconciliationMatches.expenseId, input.bookItemId)),
  ));
}

export async function postedCashLines(tx: Database, organisationId: string, type: 'payment' | 'expense', id: string) {
  return tx.select({ accountId: accounts.id, debit: journalEntryLines.debitAmount, credit: journalEntryLines.creditAmount })
    .from(journalEntryLines).innerJoin(journalEntries, and(eq(journalEntries.id, journalEntryLines.journalEntryId), eq(journalEntries.organisationId, organisationId)))
    .innerJoin(accounts, and(eq(accounts.id, journalEntryLines.accountId), eq(accounts.organisationId, organisationId)))
    .where(and(eq(journalEntryLines.organisationId, organisationId), eq(journalEntries.status, 'posted'),
      eq(journalEntries.referenceType, type === 'payment' ? 'invoice_payment' : 'expense'),
      eq(journalEntries.referenceId, id), inArray(accounts.type, ['bank', 'cash'])));
}

export async function rejectTransactionMatches(tx: Database, organisationId: string, transactionId: string) {
  await tx.update(reconciliationMatches).set({ status: 'rejected' }).where(and(
    eq(reconciliationMatches.organisationId, organisationId), eq(reconciliationMatches.bankTransactionId, transactionId),
    eq(reconciliationMatches.status, 'confirmed'),
  ));
}
