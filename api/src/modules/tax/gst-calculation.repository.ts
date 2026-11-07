import { and, eq, inArray, lte } from 'drizzle-orm';
import type { GstCalculationSource } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { invoices } from '../../db/schema/invoices';
import { expenses } from '../../db/schema/expenses';
import { payments } from '../../db/schema/payments';
import { bills, billPayments } from '../../db/schema/purchases';
import { creditNotes, creditNoteRefunds } from '../../db/schema/credit-notes';

const documentTypes = new Set(['invoice', 'invoice_cancellation', 'invoice_restore', 'bill', 'bill_void', 'bill_restore', 'expense', 'expense_reversal', 'credit_note', 'credit_note_reversal']);
const settlementTypes = new Set(['invoice_payment', 'payment_reversal', 'bill_payment', 'bill_payment_reversal', 'credit_note_refund', 'credit_note_refund_reversal']);

/** PII-free immutable financial evidence. Prior-period rows are retained because
 * cumulative cash GST allocation needs settlement and credit history. */
export async function gstCalculationSources(tx: Database, organisationId: string, through: string): Promise<GstCalculationSource[]> {
  const entries = await tx.select({ id: journalEntries.id, date: journalEntries.entryDate, referenceType: journalEntries.referenceType, referenceId: journalEntries.referenceId, total: journalEntries.totalAmount })
    .from(journalEntries).where(and(eq(journalEntries.organisationId, organisationId), lte(journalEntries.entryDate, through), inArray(journalEntries.status, ['posted', 'reversed'])));
  const lines = await tx.select({ id: journalEntryLines.id, journalId: journalEntries.id, date: journalEntries.entryDate, accountId: accounts.id, accountNumber: accounts.accountNumber, accountClass: accounts.accountClass, debit: journalEntryLines.debitAmount, credit: journalEntryLines.creditAmount, lineOrder: journalEntryLines.lineOrder })
    .from(journalEntryLines).innerJoin(journalEntries, and(eq(journalEntries.id, journalEntryLines.journalEntryId), eq(journalEntries.organisationId, organisationId)))
    .innerJoin(accounts, and(eq(accounts.id, journalEntryLines.accountId), eq(accounts.organisationId, organisationId)))
    .where(and(eq(journalEntryLines.organisationId, organisationId), lte(journalEntries.entryDate, through), inArray(journalEntries.status, ['posted', 'reversed'])));
  const taxEntries = new Set(lines.filter(row => ['2150', '2200'].includes(row.accountNumber ?? '')).map(row => row.journalId));
  const eligibleEntries = entries.filter(row => taxEntries.has(row.id) || documentTypes.has(row.referenceType ?? '') || settlementTypes.has(row.referenceType ?? ''));
  const entryIds = new Set(eligibleEntries.map(row => row.id));
  const sources: GstCalculationSource[] = [
    ...eligibleEntries.map(({ id, date, ...values }) => ({ type: 'journals' as const, id, date, values })),
    ...lines.filter(row => entryIds.has(row.journalId)).map(({ id, date, ...values }) => ({ type: 'journalLines' as const, id, date, values })),
  ];
  const [saleSettlements, purchaseSettlements, credits, refunds] = await Promise.all([
    tx.select({ id: payments.id, documentId: payments.invoiceId, date: payments.paymentDate, amount: payments.amount, currency: payments.currency, baseAmount: payments.baseAmount, bookBaseAmount: payments.bookBaseAmount, exchangeRate: payments.exchangeRate, reversalDate: payments.reversalDate }).from(payments)
      .where(and(eq(payments.organisationId, organisationId), lte(payments.paymentDate, through), inArray(payments.status, ['completed', 'refunded']))),
    tx.select({ id: billPayments.id, documentId: billPayments.billId, date: billPayments.paymentDate, amount: billPayments.amount, currency: billPayments.currency, baseAmount: billPayments.baseAmount, bookBaseAmount: billPayments.bookBaseAmount, exchangeRate: billPayments.exchangeRate, reversalDate: billPayments.reversalDate }).from(billPayments)
      .where(and(eq(billPayments.organisationId, organisationId), lte(billPayments.paymentDate, through), inArray(billPayments.status, ['completed', 'reversed']))),
    tx.select({ id: creditNotes.id, documentId: creditNotes.invoiceId, date: creditNotes.issueDate, total: creditNotes.total, taxAmount: creditNotes.taxAmount, baseTotal: creditNotes.baseTotal, baseTaxAmount: creditNotes.baseTaxAmount, receivableAmount: creditNotes.receivableAmount, customerCreditAmount: creditNotes.customerCreditAmount, baseCustomerCreditTaxAmount: creditNotes.baseCustomerCreditTaxAmount, reversalDate: creditNotes.reversalDate }).from(creditNotes)
      .where(and(eq(creditNotes.organisationId, organisationId), lte(creditNotes.issueDate, through))),
    tx.select({ id: creditNoteRefunds.id, documentId: creditNoteRefunds.creditNoteId, date: creditNoteRefunds.refundDate, amount: creditNoteRefunds.amount, baseAmount: creditNoteRefunds.baseAmount, bookBaseAmount: creditNoteRefunds.bookBaseAmount, reversalDate: creditNoteRefunds.reversalDate }).from(creditNoteRefunds)
      .where(and(eq(creditNoteRefunds.organisationId, organisationId), lte(creditNoteRefunds.refundDate, through))),
  ]);
  for (const [type, rows] of [['payments', saleSettlements], ['billPayments', purchaseSettlements], ['creditNotes', credits], ['creditNoteRefunds', refunds]] as const) {
    for (const { id, date, documentId, ...values } of rows) sources.push({ type, id, date, documentId, values: { ...values, reversalDate: values.reversalDate && values.reversalDate <= through ? values.reversalDate : null } });
  }
  const invoiceIds = new Set([...eligibleEntries.filter(row => row.referenceType?.startsWith('invoice')).map(row => row.referenceId), ...saleSettlements.map(row => row.documentId), ...credits.map(row => row.documentId)].filter((id): id is string => Boolean(id)));
  const billIds = new Set([...eligibleEntries.filter(row => row.referenceType?.startsWith('bill')).map(row => row.referenceId), ...purchaseSettlements.map(row => row.documentId)].filter((id): id is string => Boolean(id)));
  const expenseIds = new Set(eligibleEntries.filter(row => row.referenceType?.startsWith('expense')).map(row => row.referenceId).filter((id): id is string => Boolean(id)));
  if (invoiceIds.size) {
    const rows = await tx.select({ id: invoices.id, date: invoices.date, total: invoices.total, taxAmount: invoices.taxAmount, currency: invoices.currency, baseTotal: invoices.baseTotal, baseTaxAmount: invoices.baseTaxAmount, exchangeRate: invoices.exchangeRate, taxInclusive: invoices.taxInclusive }).from(invoices).where(and(eq(invoices.organisationId, organisationId), inArray(invoices.id, [...invoiceIds])));
    sources.push(...rows.map(({ id, date, ...values }) => ({ type: 'invoices' as const, id, date, values })));
  }
  if (billIds.size) {
    const rows = await tx.select({ id: bills.id, date: bills.issueDate, total: bills.total, taxAmount: bills.taxAmount, currency: bills.currency, baseTotal: bills.baseTotal, baseTaxAmount: bills.baseTaxAmount, exchangeRate: bills.exchangeRate, taxInclusive: bills.taxInclusive }).from(bills).where(and(eq(bills.organisationId, organisationId), inArray(bills.id, [...billIds])));
    sources.push(...rows.map(({ id, date, ...values }) => ({ type: 'bills' as const, id, date, values })));
  }
  if (expenseIds.size) {
    const rows = await tx.select({ id: expenses.id, date: expenses.expenseDate, amount: expenses.amount, taxAmount: expenses.taxAmount, currency: expenses.currency, baseAmount: expenses.baseAmount, baseTaxAmount: expenses.baseTaxAmount, exchangeRate: expenses.exchangeRate, gstTreatment: expenses.gstTreatment, claimablePercentage: expenses.gstClaimablePercentage, privateUsePercentage: expenses.privateUsePercentage }).from(expenses).where(and(eq(expenses.organisationId, organisationId), inArray(expenses.id, [...expenseIds])));
    sources.push(...rows.map(({ id, date, ...values }) => ({ type: 'expenses' as const, id, date, values })));
  }
  return sources.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}
