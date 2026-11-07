import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { bankPreferences } from '../../db/schema/bank-preferences';
import { bankTransactions } from '../../db/schema/bank';
export async function defaultBankAccount(tx: Database, organisationId: string) {
  const [row] = await tx.select().from(bankPreferences).where(eq(bankPreferences.organisationId, organisationId));
  return row?.defaultAccountId ?? null;
}
export async function setDefaultBankAccount(tx: Database, organisationId: string, defaultAccountId: string | null) {
  await tx.insert(bankPreferences).values({ organisationId, defaultAccountId }).onConflictDoUpdate({ target: bankPreferences.organisationId, set: { defaultAccountId } });
}
export function movements(tx: Database, organisationId: string, accountId: string) {
  return tx.select({ date: bankTransactions.transactionDate, amount: bankTransactions.amount, type: bankTransactions.type }).from(bankTransactions).where(and(eq(bankTransactions.organisationId, organisationId), eq(bankTransactions.bankAccountId, accountId)));
}
