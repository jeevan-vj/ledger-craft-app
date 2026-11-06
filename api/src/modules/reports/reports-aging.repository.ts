import { and, eq, inArray, lte } from 'drizzle-orm';
import type { FinancialReportQuery } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { invoices } from '../../db/schema/invoices';
import { customers } from '../../db/schema/customers';
import { bills, billPayments, vendors } from '../../db/schema/purchases';
import { payments } from '../../db/schema/payments';
import { creditNotes } from '../../db/schema/credit-notes';
import { bankReconciliationActionItems } from '../../db/schema/reconciliation-actions';
import { decimal, roundMoney } from '../invoices/money';

type Document = { id: string; number: string; partyId: string; partyName: string; issueDate: string; dueDate: string };
export type AgingDocument = Document & { subtotal: string; tax: string; total: string; paid: string; balanceDue: string; currency: string; status: string };
type Event = { documentId: string; balance: string; total: string; tax: string; paid: string };

/** Age the actual dated control-account movements, never today's mutable
 * document payment/status fields or a second foreign-currency conversion. */
export async function historicalAgingDocuments(tx: Database, organisationId: string, query: FinancialReportQuery, kind: 'invoice' | 'bill'): Promise<AgingDocument[]> {
  const documents = await documentRows(tx, organisationId, query, kind);
  if (!documents.length) return [];
  const controlCode = kind === 'invoice' ? '1200' : '2100';
  const taxCode = kind === 'invoice' ? '2200' : '2150';
  const [entries, lines, receipts, supplierPayments, notes, actionItems] = await Promise.all([
    tx.select({ id: journalEntries.id, type: journalEntries.referenceType, sourceId: journalEntries.referenceId, date: journalEntries.entryDate }).from(journalEntries)
      .where(and(eq(journalEntries.organisationId, organisationId), inArray(journalEntries.status, ['posted', 'reversed']))),
    tx.select({ journalId: journalEntries.id, code: accounts.accountNumber, description: journalEntryLines.description, debit: journalEntryLines.debitAmount, credit: journalEntryLines.creditAmount }).from(journalEntryLines)
      .innerJoin(journalEntries, and(eq(journalEntries.id, journalEntryLines.journalEntryId), eq(journalEntries.organisationId, organisationId)))
      .innerJoin(accounts, and(eq(accounts.id, journalEntryLines.accountId), eq(accounts.organisationId, organisationId)))
      .where(and(eq(journalEntryLines.organisationId, organisationId), inArray(journalEntries.status, ['posted', 'reversed']), lte(journalEntries.entryDate, query.to), inArray(accounts.accountNumber, [controlCode, taxCode]))),
    tx.select({ id: payments.id, documentId: payments.invoiceId }).from(payments).where(eq(payments.organisationId, organisationId)),
    tx.select({ id: billPayments.id, documentId: billPayments.billId }).from(billPayments).where(eq(billPayments.organisationId, organisationId)),
    tx.select({ id: creditNotes.id, documentId: creditNotes.invoiceId }).from(creditNotes).where(eq(creditNotes.organisationId, organisationId)),
    tx.select({ actionId: bankReconciliationActionItems.actionId, kind: bankReconciliationActionItems.documentType, documentId: bankReconciliationActionItems.documentId }).from(bankReconciliationActionItems).where(eq(bankReconciliationActionItems.organisationId, organisationId)),
  ]);
  const linesByJournal = new Map<string, typeof lines>();
  for (const line of lines) {
    const group = linesByJournal.get(line.journalId) ?? [];
    group.push(line); linesByJournal.set(line.journalId, group);
  }
  const itemsByAction = new Map<string, typeof actionItems>();
  for (const item of actionItems) {
    const group = itemsByAction.get(item.actionId) ?? [];
    group.push(item); itemsByAction.set(item.actionId, group);
  }
  const documentById = new Map(documents.map((row) => [row.id, row]));
  const entryById = new Map(entries.map((row) => [row.id, row]));
  const sourceTypes = kind === 'invoice' ? ['invoice', 'invoice_cancellation', 'invoice_restore'] : ['bill', 'bill_void', 'bill_restore'];
  const paymentType = kind === 'invoice' ? 'invoice_payment' : 'bill_payment';
  const paymentById = new Map((kind === 'invoice' ? receipts : supplierPayments).map((row) => [row.id, row.documentId]));
  const noteById = new Map(notes.map((row) => [row.id, row.documentId]));
  const reversedTypes = new Set(['invoice_payment_reversal', 'bill_payment_reversal', 'credit_note_reversal', 'bank_reconciliation_undo']);
  const eventsByEntry = new Map<string, Event[]>();
  const control = (entryLines: typeof lines) => roundMoney(entryLines.filter((line) => line.code === controlCode).reduce((sum, line) => kind === 'invoice' ? sum.add(line.debit).sub(line.credit) : sum.add(line.credit).sub(line.debit), decimal(0)));
  const tax = (entryLines: typeof lines) => roundMoney(entryLines.filter((line) => line.code === taxCode).reduce((sum, line) => kind === 'invoice' ? sum.add(line.credit).sub(line.debit) : sum.add(line.debit).sub(line.credit), decimal(0)));
  function eventsFor(id: string, visited = new Set<string>()): Event[] {
    const cached = eventsByEntry.get(id); if (cached) return cached;
    const entry = entryById.get(id);
    if (!entry || !entry.sourceId || visited.has(id)) return [];
    visited.add(id);
    const entryLines = linesByJournal.get(id) ?? [];
    const balance = control(entryLines);
    let documentId: string | undefined;
    let isSource = false; let isPayment = false;
    if (sourceTypes.includes(entry.type ?? '')) { documentId = entry.sourceId; isSource = true; }
    else if (entry.type === paymentType) { documentId = paymentById.get(entry.sourceId); isPayment = true; }
    else if (kind === 'invoice' && entry.type === 'credit_note') documentId = noteById.get(entry.sourceId);
    else if (entry.type === 'fx_revaluation' || entry.type === 'fx_revaluation_reversal') {
      const reference = /^\d{4}-\d{2}-\d{2}:(invoice|bill):(.+)$/.exec(entry.sourceId);
      if (reference?.[1] === kind) documentId = reference[2];
    } else if (entry.type === 'bank_reconciliation_accept') {
      const events = (itemsByAction.get(entry.sourceId) ?? []).filter((item) => item.kind === kind && documentById.has(item.documentId)).map((item): Event => {
        const document = documentById.get(item.documentId)!;
        const matched = entryLines.filter((line) => line.code === controlCode && line.description === `${kind === 'invoice' ? 'Invoice' : 'Bill'} ${document.number}`);
        const amount = control(matched);
        return { documentId: item.documentId, balance: amount, total: '0.00', tax: '0.00', paid: roundMoney(decimal(0).sub(amount)) };
      });
      eventsByEntry.set(id, events); return events;
    } else if (reversedTypes.has(entry.type ?? '')) {
      // Reversals reference the retained source journal, not the live document.
      // Their exact original per-document allocation survives multi-document bank undo.
      const original = eventsFor(entry.sourceId, visited);
      const reversed = original.map((event) => ({ documentId: event.documentId, balance: roundMoney(decimal(0).sub(event.balance)), total: roundMoney(decimal(0).sub(event.total)), tax: roundMoney(decimal(0).sub(event.tax)), paid: roundMoney(decimal(0).sub(event.paid)) }));
      eventsByEntry.set(id, reversed); return reversed;
    }
    if (!documentId || !documentById.has(documentId)) return [];
    const result = [{ documentId, balance, total: isSource ? balance : '0.00', tax: isSource ? tax(entryLines) : '0.00', paid: isPayment ? roundMoney(decimal(0).sub(balance)) : '0.00' }];
    eventsByEntry.set(id, result); return result;
  }
  const totals = new Map<string, { balance: ReturnType<typeof decimal>; total: ReturnType<typeof decimal>; tax: ReturnType<typeof decimal>; paid: ReturnType<typeof decimal> }>();
  for (const entry of entries.filter((row) => row.date <= query.to)) {
    for (const event of eventsFor(entry.id)) {
      const current = totals.get(event.documentId) ?? { balance: decimal(0), total: decimal(0), tax: decimal(0), paid: decimal(0) };
      current.balance = current.balance.add(event.balance); current.total = current.total.add(event.total);
      current.tax = current.tax.add(event.tax); current.paid = current.paid.add(event.paid); totals.set(event.documentId, current);
    }
  }
  return documents.filter((row) => totals.has(row.id)).map((row) => {
    const value = totals.get(row.id)!;
    return { ...row, subtotal: roundMoney(value.total.sub(value.tax)), tax: roundMoney(value.tax), total: roundMoney(value.total), paid: roundMoney(value.paid), balanceDue: roundMoney(value.balance), currency: query.baseCurrency, status: 'posted' };
  });
}

async function documentRows(tx: Database, organisationId: string, query: FinancialReportQuery, kind: 'invoice' | 'bill'): Promise<Document[]> {
  if (kind === 'invoice') {
    const conditions = [eq(invoices.organisationId, organisationId), lte(invoices.date, query.to)];
    if (query.customerIds?.length) conditions.push(inArray(invoices.customerId, query.customerIds));
    return tx.select({ id: invoices.id, number: invoices.invoiceNumber, partyId: invoices.customerId, partyName: customers.name, issueDate: invoices.date, dueDate: invoices.dueDate }).from(invoices)
      .innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organisationId, organisationId))).where(and(...conditions));
  }
  const conditions = [eq(bills.organisationId, organisationId), lte(bills.issueDate, query.to)];
  if (query.vendorIds?.length) conditions.push(inArray(bills.vendorId, query.vendorIds));
  return tx.select({ id: bills.id, number: bills.billNumber, partyId: bills.vendorId, partyName: vendors.name, issueDate: bills.issueDate, dueDate: bills.dueDate }).from(bills)
    .innerJoin(vendors, and(eq(vendors.id, bills.vendorId), eq(vendors.organisationId, organisationId))).where(and(...conditions));
}
