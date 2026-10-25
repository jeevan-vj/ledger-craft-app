import { and, asc, eq, gte, inArray, lt, lte, ne } from 'drizzle-orm';
import type { FinancialReportQuery } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { customers } from '../../db/schema/customers';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { bills, vendors } from '../../db/schema/purchases';

export type LedgerRow = {
  journalEntryId: string;
  entryNumber: string;
  date: string;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  accountId: string;
  accountNumber: string | null;
  accountName: string;
  accountType: string;
  accountClass: string;
  normalBalance: string;
  currency: string;
  debit: string;
  credit: string;
};

const CASH_REFERENCE_TYPES = ['invoice_payment', 'bill_payment', 'expense', 'expense_reversal', 'bank_transaction', 'bank_transaction_reversal', 'bank_transfer', 'bank_transfer_out', 'bank_transfer_in'];

export async function ledgerRows(
  tx: Database,
  organisationId: string,
  query: FinancialReportQuery,
  before?: string,
): Promise<LedgerRow[]> {
  const conditions = [
    eq(journalEntries.organisationId, organisationId),
    inArray(journalEntries.status, ['posted', 'reversed']),
    before ? lt(journalEntries.entryDate, before) : lte(journalEntries.entryDate, query.to),
  ];
  if (!before) conditions.push(gte(journalEntries.entryDate, query.from));
  if (query.accountIds?.length) conditions.push(inArray(journalEntryLines.accountId, query.accountIds));
  if (query.basis === 'cash') conditions.push(inArray(journalEntries.referenceType, CASH_REFERENCE_TYPES));

  const rows = await tx.select({
    journalEntryId: journalEntries.id,
    entryNumber: journalEntries.entryNumber,
    date: journalEntries.entryDate,
    description: journalEntries.description,
    referenceType: journalEntries.referenceType,
    referenceId: journalEntries.referenceId,
    accountId: accounts.id,
    accountNumber: accounts.accountNumber,
    accountName: accounts.name,
    accountType: accounts.type,
    accountClass: accounts.accountClass,
    normalBalance: accounts.normalBalance,
    currency: accounts.currency,
    debit: journalEntryLines.debitAmount,
    credit: journalEntryLines.creditAmount,
  }).from(journalEntryLines)
    .innerJoin(journalEntries, and(
      eq(journalEntries.id, journalEntryLines.journalEntryId),
      eq(journalEntries.organisationId, journalEntryLines.organisationId),
    ))
    .innerJoin(accounts, and(
      eq(accounts.id, journalEntryLines.accountId),
      eq(accounts.organisationId, journalEntryLines.organisationId),
    ))
    .where(and(...conditions))
    .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNumber), asc(journalEntryLines.lineOrder));

  return rows.map((row) => ({ ...row, accountClass: normaliseClass(row.accountClass, row.accountType), normalBalance: row.normalBalance ?? normalBalance(normaliseClass(row.accountClass, row.accountType)) }));
}

function normaliseClass(value: string | null, type: string): LedgerRow['accountClass'] {
  if (value && ['asset', 'liability', 'equity', 'revenue', 'expense'].includes(value)) return value;
  if (['bank', 'cash', 'asset'].includes(type)) return 'asset';
  if (['liability', 'credit_card'].includes(type)) return 'liability';
  if (type === 'revenue' || type === 'income') return 'revenue';
  if (type === 'expense') return 'expense';
  return 'equity';
}

function normalBalance(accountClass: string) {
  return ['asset', 'expense'].includes(accountClass) ? 'debit' : 'credit';
}

export async function receivables(tx: Database, organisationId: string, query: FinancialReportQuery) {
  const conditions = [eq(invoices.organisationId, organisationId), lte(invoices.date, query.to)];
  if (query.customerIds?.length) conditions.push(inArray(invoices.customerId, query.customerIds));
  const rows = await tx.select({
    id: invoices.id, number: invoices.invoiceNumber, partyId: invoices.customerId, partyName: customers.name,
    issueDate: invoices.date, dueDate: invoices.dueDate, subtotal: invoices.subtotal, tax: invoices.taxAmount,
    total: invoices.total, paid: invoices.totalPaid, balanceDue: invoices.balanceDue, currency: invoices.currency,
    status: invoices.status,
  }).from(invoices).innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organisationId, organisationId)))
    .where(and(...conditions));
  return rows.filter((row) => row.status !== 'draft' && row.currency === query.baseCurrency);
}

export async function payables(tx: Database, organisationId: string, query: FinancialReportQuery) {
  const conditions = [eq(bills.organisationId, organisationId), lte(bills.issueDate, query.to)];
  if (query.vendorIds?.length) conditions.push(inArray(bills.vendorId, query.vendorIds));
  const rows = await tx.select({
    id: bills.id, number: bills.billNumber, partyId: bills.vendorId, partyName: vendors.name,
    issueDate: bills.issueDate, dueDate: bills.dueDate, subtotal: bills.subtotal, tax: bills.taxAmount,
    total: bills.total, paid: bills.totalPaid, balanceDue: bills.balanceDue, currency: bills.currency,
    status: bills.lifecycleStatus,
  }).from(bills).innerJoin(vendors, and(eq(vendors.id, bills.vendorId), eq(vendors.organisationId, organisationId)))
    .where(and(...conditions));
  return rows.filter((row) => row.status === 'received' && row.currency === query.baseCurrency);
}

export async function account(tx: Database, organisationId: string, accountId: string) {
  const [row] = await tx.select().from(accounts).where(and(eq(accounts.organisationId, organisationId), eq(accounts.id, accountId)));
  return row ?? null;
}

/**
 * Ids of invoices, bills and expenses not denominated in the report's base
 * currency. Their journals carry document-currency amounts (no FX conversion at
 * posting time), so they must not be summed into a base-currency GST return.
 */
export async function foreignCurrencyDocumentIds(tx: Database, organisationId: string, baseCurrency: string): Promise<Set<string>> {
  const [invoiceRows, billRows, expenseRows] = await Promise.all([
    tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.organisationId, organisationId), ne(invoices.currency, baseCurrency))),
    tx.select({ id: bills.id }).from(bills).where(and(eq(bills.organisationId, organisationId), ne(bills.currency, baseCurrency))),
    tx.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.organisationId, organisationId), ne(expenses.currency, baseCurrency))),
  ]);
  return new Set([...invoiceRows, ...billRows, ...expenseRows].map((row) => row.id));
}
