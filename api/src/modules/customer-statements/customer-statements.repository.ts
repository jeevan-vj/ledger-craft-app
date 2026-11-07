import { and, eq, inArray, lte, asc } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customers } from '../../db/schema/customers';
import { invoices } from '../../db/schema/invoices';
import { payments } from '../../db/schema/payments';
import { creditNotes, creditNoteRefunds } from '../../db/schema/credit-notes';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { bankReconciliationActionItems } from '../../db/schema/reconciliation-actions';
import { statementShares } from '../../db/schema/customer-collections';
export async function customer(tx: Database, org: string, id: string) { const [r] = await tx.select().from(customers).where(and(eq(customers.organisationId, org), eq(customers.id, id))); return r; }
export async function sourceRows(tx: Database, org: string, customerId: string, to: string) {
    const sales = await tx.select().from(invoices).where(and(eq(invoices.organisationId, org), eq(invoices.customerId, customerId)));
    const [entries, lines, receipts, credits, refunds, connections] = await Promise.all([
        tx.select().from(journalEntries).where(and(eq(journalEntries.organisationId, org), inArray(journalEntries.status, ['posted', 'reversed']))),
        tx.select({ id: journalEntryLines.id, lineOrder: journalEntryLines.lineOrder, journalId: journalEntries.id, date: journalEntries.entryDate, entryNumber: journalEntries.entryNumber, type: journalEntries.referenceType, reference: journalEntries.referenceId, description: journalEntryLines.description, code: accounts.accountNumber, debit: journalEntryLines.debitAmount, credit: journalEntryLines.creditAmount }).from(journalEntryLines).innerJoin(journalEntries, and(eq(journalEntries.id, journalEntryLines.journalEntryId), eq(journalEntries.organisationId, org))).innerJoin(accounts, and(eq(accounts.id, journalEntryLines.accountId), eq(accounts.organisationId, org))).where(and(eq(journalEntryLines.organisationId, org), inArray(journalEntries.status, ['posted', 'reversed']), lte(journalEntries.entryDate, to), inArray(accounts.accountNumber, ['1200', '2300']))).orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNumber), asc(journalEntryLines.lineOrder)),
        tx.select().from(payments).where(eq(payments.organisationId, org)), tx.select().from(creditNotes).where(eq(creditNotes.organisationId, org)), tx.select().from(creditNoteRefunds).where(eq(creditNoteRefunds.organisationId, org)), tx.select().from(bankReconciliationActionItems).where(and(eq(bankReconciliationActionItems.organisationId, org), eq(bankReconciliationActionItems.documentType, 'invoice'))),
    ]);
    return { sales, entries, lines, receipts, credits, refunds, connections };
}
export async function saveShare(tx: Database, input: typeof statementShares.$inferInsert) { await tx.insert(statementShares).values(input); }
export async function shareByHash(tx: Database, hash: string) { const [r] = await tx.select().from(statementShares).where(eq(statementShares.tokenHash, hash)); return r; }
export async function revokeShares(tx: Database, org: string, id: string) { await tx.update(statementShares).set({ revokedAt: new Date() }).where(and(eq(statementShares.organisationId, org), eq(statementShares.customerId, id))); }
