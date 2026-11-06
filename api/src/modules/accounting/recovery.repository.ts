import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { bankAccounts, bankTransactions } from '../../db/schema/bank';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { payments } from '../../db/schema/payments';
import { bills, billPayments } from '../../db/schema/purchases';
import { bankReconciliationActions } from '../../db/schema/reconciliation-actions';
import { reconciliationMatches } from '../../db/schema/reconciliation';

/** A company snapshot, never a cross-tenant scan or SQL aggregation of money. */
export async function recoverySnapshot(tx: Database, organisationId: string) {
  const [accountRows, entries, lines, expenseRows, supplierPayments, supplierBills, banks, transactions, matches, invoicePayments, actions, invoiceRows] = await Promise.all([
    tx.select().from(accounts).where(eq(accounts.organisationId, organisationId)),
    tx.select().from(journalEntries).where(and(eq(journalEntries.organisationId, organisationId), inArray(journalEntries.status, ['posted', 'reversed']))),
    tx.select().from(journalEntryLines).where(eq(journalEntryLines.organisationId, organisationId)),
    tx.select().from(expenses).where(eq(expenses.organisationId, organisationId)),
    tx.select().from(billPayments).where(eq(billPayments.organisationId, organisationId)),
    tx.select().from(bills).where(eq(bills.organisationId, organisationId)),
    tx.select().from(bankAccounts).where(eq(bankAccounts.organisationId, organisationId)),
    tx.select().from(bankTransactions).where(eq(bankTransactions.organisationId, organisationId)),
    tx.select().from(reconciliationMatches).where(and(eq(reconciliationMatches.organisationId, organisationId), eq(reconciliationMatches.status, 'confirmed'))),
    tx.select().from(payments).where(eq(payments.organisationId, organisationId)),
    tx.select().from(bankReconciliationActions).where(eq(bankReconciliationActions.organisationId, organisationId)),
    tx.select().from(invoices).where(eq(invoices.organisationId, organisationId)),
  ]);
  return { accountRows, entries, lines, expenseRows, supplierPayments, supplierBills, banks, transactions, matches, invoicePayments, actions, invoiceRows };
}
export async function openingEntries(tx: Database, organisationId: string) {
  return tx.select().from(journalEntries).where(and(eq(journalEntries.organisationId, organisationId), eq(journalEntries.referenceType, 'opening_balance')));
}
export async function companyAccounts(tx: Database, organisationId: string) {
  return tx.select().from(accounts).where(eq(accounts.organisationId, organisationId));
}
