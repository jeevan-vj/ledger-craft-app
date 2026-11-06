import { and, eq, inArray, lte, ne } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { invoices } from '../../db/schema/invoices';
import { bills, billPayments } from '../../db/schema/purchases';
import { payments } from '../../db/schema/payments';
import { accounts, journalEntries } from '../../db/schema/accounts';
import { idempotencyKeys } from '../../db/schema/idempotency';
import { creditNotes } from '../../db/schema/credit-notes';

export async function foreignDocuments(tx: Database, organisationId: string, date: string) {
  const receivables = await tx.select({ id: invoices.id, number: invoices.invoiceNumber, currency: invoices.currency, baseCurrency: invoices.baseCurrency, total: invoices.total, baseTotal: invoices.baseTotal })
    .from(invoices).where(and(eq(invoices.organisationId, organisationId), ne(invoices.currency, invoices.baseCurrency), lte(invoices.date, date)));
  const payables = await tx.select({ id: bills.id, number: bills.billNumber, currency: bills.currency, baseCurrency: bills.baseCurrency, total: bills.total, baseTotal: bills.baseTotal })
    .from(bills).where(and(eq(bills.organisationId, organisationId), ne(bills.currency, bills.baseCurrency), lte(bills.issueDate, date)));
  return [...receivables.map(row => ({ ...row, type: 'invoice' as const })), ...payables.map(row => ({ ...row, type: 'bill' as const }))];
}

export async function sourceMovements(tx: Database, organisationId: string, date: string) {
  return tx.select({ id: journalEntries.id, type: journalEntries.referenceType, documentId: journalEntries.referenceId, total: journalEntries.totalAmount })
    .from(journalEntries).where(and(eq(journalEntries.organisationId, organisationId), inArray(journalEntries.status, ['posted', 'reversed']),
      lte(journalEntries.entryDate, date), inArray(journalEntries.referenceType, ['invoice', 'invoice_cancellation', 'invoice_restore', 'bill', 'bill_void', 'bill_restore'])));
}

export async function settlementsAsOf(tx: Database, organisationId: string, date: string) {
  const receivables = await tx.select({ documentId: payments.invoiceId, amount: payments.amount, bookBaseAmount: payments.bookBaseAmount, status: payments.status, reversalDate: payments.reversalDate })
    .from(payments).where(and(eq(payments.organisationId, organisationId), lte(payments.paymentDate, date)));
  const payables = await tx.select({ documentId: billPayments.billId, amount: billPayments.amount, bookBaseAmount: billPayments.bookBaseAmount, status: billPayments.status, reversalDate: billPayments.reversalDate })
    .from(billPayments).where(and(eq(billPayments.organisationId, organisationId), lte(billPayments.paymentDate, date)));
  return [...receivables, ...payables].filter(row => row.status === 'completed' ||
    ((row.status === 'refunded' || row.status === 'reversed') && row.reversalDate !== null && row.reversalDate > date));
}

export async function creditsAsOf(tx: Database, organisationId: string, date: string) {
  const rows = await tx.select({ documentId: creditNotes.invoiceId, amount: creditNotes.receivableAmount, baseAmount: creditNotes.baseReceivableAmount, status: creditNotes.status, reversalDate: creditNotes.reversalDate })
    .from(creditNotes).where(and(eq(creditNotes.organisationId, organisationId), lte(creditNotes.issueDate, date)));
  return rows.filter(row => row.status === 'issued' || (row.status === 'reversed' && row.reversalDate !== null && row.reversalDate > date));
}

/** One immutable company/date valuation batch, even when another member retries. */
export async function storedRevaluation(tx: Database, organisationId: string, key: string) {
  const [row] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.organisationId, organisationId), eq(idempotencyKeys.key, key), eq(idempotencyKeys.method, 'POST'), eq(idempotencyKeys.path, '/api/fx-revaluations')));
  return row;
}

export async function unrealizedAccount(tx: Database, ctx: { organisationId: string; userId: string }, gain: boolean) {
  const code = gain ? '4201' : '5201';
  const [existing] = await tx.select().from(accounts).where(and(eq(accounts.organisationId, ctx.organisationId), eq(accounts.accountNumber, code)));
  const accountClass = gain ? 'revenue' : 'expense';
  if (existing) return existing.accountClass === accountClass && existing.normalBalance === (gain ? 'credit' : 'debit') && existing.isActive ? existing.id : null;
  const [row] = await tx.insert(accounts).values({ organisationId: ctx.organisationId, userId: ctx.userId, accountNumber: code,
    name: gain ? 'Unrealized Foreign Exchange Gain' : 'Unrealized Foreign Exchange Loss', type: accountClass, accountClass, normalBalance: gain ? 'credit' : 'debit',
  }).returning({ id: accounts.id });
  return row?.id ?? null;
}
