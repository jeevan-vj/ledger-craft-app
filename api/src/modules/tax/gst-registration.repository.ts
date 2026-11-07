import { eq, inArray, and } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { journalEntries } from '../../db/schema/accounts';
import { invoices } from '../../db/schema/invoices';
import { expenses } from '../../db/schema/expenses';
import { bills, billPayments } from '../../db/schema/purchases';
import { payments } from '../../db/schema/payments';
import { creditNotes, creditNoteRefunds } from '../../db/schema/credit-notes';

/** Registration follows the original supply, including immutable source-journal
 * links after the source document was deleted. A later reversal cannot create a
 * credit for a pre-registration GST claim which was never included. */
export async function gstRegistrationExclusions(tx: Database, organisationId: string, registeredFrom: string) {
  const [entries, sales, purchases, costs, receipts, settlements, credits, refunds] = await Promise.all([
    tx.select({ id: journalEntries.id, date: journalEntries.entryDate, type: journalEntries.referenceType, reference: journalEntries.referenceId })
      .from(journalEntries).where(and(eq(journalEntries.organisationId, organisationId), inArray(journalEntries.status, ['posted', 'reversed']))),
    tx.select({ id: invoices.id, date: invoices.date }).from(invoices).where(eq(invoices.organisationId, organisationId)),
    tx.select({ id: bills.id, date: bills.issueDate }).from(bills).where(eq(bills.organisationId, organisationId)),
    tx.select({ id: expenses.id, date: expenses.expenseDate }).from(expenses).where(eq(expenses.organisationId, organisationId)),
    tx.select({ id: payments.id, invoiceId: payments.invoiceId }).from(payments).where(eq(payments.organisationId, organisationId)),
    tx.select({ id: billPayments.id, billId: billPayments.billId }).from(billPayments).where(eq(billPayments.organisationId, organisationId)),
    tx.select({ id: creditNotes.id, invoiceId: creditNotes.invoiceId }).from(creditNotes).where(eq(creditNotes.organisationId, organisationId)),
    tx.select({ id: creditNoteRefunds.id, creditId: creditNoteRefunds.creditNoteId }).from(creditNoteRefunds).where(eq(creditNoteRefunds.organisationId, organisationId)),
  ]);
  const journalById = new Map(entries.map(row => [row.id, row]));
  const dates = (kind: string, rows: Array<{ id: string; date: string }>) => {
    const result = new Map(rows.map(row => [row.id, row.date]));
    // An edited source date cannot rewrite its original accounting eligibility.
    const original = new Map<string, string>();
    for (const row of entries.filter(row => row.type === kind && row.reference)) {
      const previous = original.get(row.reference!);
      if (!previous || row.date < previous) original.set(row.reference!, row.date);
    }
    for (const [id, date] of original) result.set(id, date);
    return result;
  };
  const saleDates = dates('invoice', sales); const purchaseDates = dates('bill', purchases); const costDates = dates('expense', costs);
  const receiptInvoices = new Map(receipts.map(row => [row.id, row.invoiceId]));
  const paymentBills = new Map(settlements.map(row => [row.id, row.billId]));
  const creditInvoices = new Map(credits.map(row => [row.id, row.invoiceId]));
  const refundCredits = new Map(refunds.map(row => [row.id, row.creditId]));
  const creditDate = (id: string) => saleDates.get(creditInvoices.get(id) ?? '');
  function origin(row: typeof entries[number], seen = new Set<string>()): string {
    if (seen.has(row.id)) return row.date;
    seen.add(row.id);
    const id = row.reference ?? '';
    if (['invoice', 'invoice_cancellation', 'invoice_restore'].includes(row.type ?? '')) return saleDates.get(id) ?? row.date;
    if (['bill', 'bill_void', 'bill_restore'].includes(row.type ?? '')) return purchaseDates.get(id) ?? row.date;
    if (row.type === 'expense') return costDates.get(id) ?? row.date;
    if (row.type === 'credit_note') return creditDate(id) ?? row.date;
    if (row.type === 'credit_note_refund') return creditDate(refundCredits.get(id) ?? '') ?? row.date;
    if (row.type === 'invoice_payment') return saleDates.get(receiptInvoices.get(id) ?? '') ?? row.date;
    if (row.type === 'bill_payment') return purchaseDates.get(paymentBills.get(id) ?? '') ?? row.date;
    const source = journalById.get(id);
    if (source) return origin(source, seen);
    return row.type === 'expense_reversal' ? costDates.get(id) ?? row.date : row.date;
  }
  return {
    journalIds: new Set(entries.filter(row => origin(row) < registeredFrom).map(row => row.id)),
    creditNoteIds: new Set(credits.filter(row => (creditDate(row.id) ?? registeredFrom) < registeredFrom).map(row => row.id)),
  };
}
export type GstRegistrationExclusions = Awaited<ReturnType<typeof gstRegistrationExclusions>>;
