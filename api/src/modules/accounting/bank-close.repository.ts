import { and, eq, gte, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts } from '../../db/schema/accounts';
import { reconciliationSessions } from '../../db/schema/reconciliation';

export async function closedBankStatements(tx: Database, organisationId: string, date?: string) {
  return tx.select({ bankAccountId: reconciliationSessions.bankAccountId, endDate: reconciliationSessions.statementEndDate })
    .from(reconciliationSessions).where(and(eq(reconciliationSessions.organisationId, organisationId),
      inArray(reconciliationSessions.status, ['completed', 'locked']),
      date === undefined ? undefined : gte(reconciliationSessions.statementEndDate, date)));
}

export async function postingTouchesClosedBank(tx: Database, organisationId: string, date: string, accountIds: string[]) {
  if (!accountIds.length) return false;
  const closed = await closedBankStatements(tx, organisationId, date);
  if (!closed.length) return false;
  const rows = await tx.select({ number: accounts.accountNumber }).from(accounts)
    .where(and(eq(accounts.organisationId, organisationId), inArray(accounts.id, accountIds)));
  const numbers = new Set(rows.map(row => row.number));
  return closed.some(row => numbers.has(`BANK-${row.bankAccountId.slice(0, 8).toUpperCase()}`));
}
