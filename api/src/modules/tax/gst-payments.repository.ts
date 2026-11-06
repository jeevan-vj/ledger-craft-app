import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { invoices } from '../../db/schema/invoices';
import { creditNotes, creditNoteRefunds } from '../../db/schema/credit-notes';
import { payments } from '../../db/schema/payments';
import { bills, billPayments } from '../../db/schema/purchases';

export async function gstSettlements(tx: Database, organisationId: string) {
  const [sales, purchases, refunds, credits] = await Promise.all([
    tx.select({ id: payments.id, documentId: invoices.id, amount: payments.amount, date: payments.paymentDate, reversalDate: payments.reversalDate, status: payments.status, total: invoices.total, baseTotal: invoices.baseTotal, currency: invoices.currency, bookBaseAmount: payments.bookBaseAmount })
      .from(payments).innerJoin(invoices, and(eq(invoices.id, payments.invoiceId), eq(invoices.organisationId, organisationId)))
      .where(and(eq(payments.organisationId, organisationId), inArray(payments.status, ['completed', 'refunded']))),
    tx.select({ id: billPayments.id, documentId: bills.id, amount: billPayments.amount, date: billPayments.paymentDate, reversalDate: billPayments.reversalDate, status: billPayments.status, total: bills.total, baseTotal: bills.baseTotal, currency: bills.currency, bookBaseAmount: billPayments.bookBaseAmount })
      .from(billPayments).innerJoin(bills, and(eq(bills.id, billPayments.billId), eq(bills.organisationId, organisationId)))
      .where(and(eq(billPayments.organisationId, organisationId), inArray(billPayments.status, ['completed', 'reversed']))),
    tx.select({ id: creditNoteRefunds.id, documentId: creditNotes.id, amount: creditNoteRefunds.amount, date: creditNoteRefunds.refundDate, reversalDate: creditNoteRefunds.reversalDate, status: creditNoteRefunds.status, total: creditNotes.customerCreditAmount, baseTotal: creditNotes.baseCustomerCreditAmount, currency: creditNotes.currency, tax: creditNotes.baseCustomerCreditTaxAmount, bookBaseAmount: creditNoteRefunds.bookBaseAmount })
      .from(creditNoteRefunds).innerJoin(creditNotes, and(eq(creditNotes.id, creditNoteRefunds.creditNoteId), eq(creditNotes.organisationId, organisationId)))
      .where(and(eq(creditNoteRefunds.organisationId, organisationId), inArray(creditNoteRefunds.status, ['completed', 'reversed']))),
    tx.select({ id: creditNotes.id, documentId: creditNotes.invoiceId, date: creditNotes.issueDate, reversalDate: creditNotes.reversalDate, amount: creditNotes.receivableAmount, tax: creditNotes.baseTaxAmount, liabilityTax: creditNotes.baseCustomerCreditTaxAmount }).from(creditNotes).where(eq(creditNotes.organisationId, organisationId)),
  ]);
  return { sales, purchases, refunds, credits };
}
