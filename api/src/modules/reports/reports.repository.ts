import { and, asc, eq, gte, inArray, lt, lte, ne } from 'drizzle-orm';
import type { FinancialReportQuery } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { organisations } from '../../db/schema/identity';
import { businessProfiles } from '../../db/schema/business-profiles';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { customers } from '../../db/schema/customers';
import { bills, vendors } from '../../db/schema/purchases';
import { decimal } from '../invoices/money';
import { historicalAgingDocuments } from './reports-aging.repository';
import {recogniseCashRows} from './cash-recognition';
import {cashRecognitionLinks} from './cash-recognition.repository';
import { bankReconciliationActions } from '../../db/schema/reconciliation-actions';
import { exchangeRates } from '../../db/schema/currency';

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
  lineDescription?: string | null;
  createdAt?: number;
  sourceJournalEntryId?: string;
  sourceEntryNumber?: string;
};



async function rawLedgerRows(
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
    createdAt: journalEntries.createdAt,
    lineDescription: journalEntryLines.description,
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

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.getTime(), accountClass: normaliseClass(row.accountClass, row.accountType), normalBalance: row.normalBalance ?? normalBalance(normaliseClass(row.accountClass, row.accountType)) }));
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
  return historicalAgingDocuments(tx, organisationId, query, 'invoice');
}

export async function payables(tx: Database, organisationId: string, query: FinancialReportQuery) {
  return historicalAgingDocuments(tx, organisationId, query, 'bill');
}

export async function account(tx: Database, organisationId: string, accountId: string) {
  const [row] = await tx.select().from(accounts).where(and(eq(accounts.organisationId, organisationId), eq(accounts.id, accountId)));
  return row ?? null;
}

/** Only legacy foreign postings that cannot be matched to a reviewed NZD
 * source snapshot are excluded. Valid base-currency journals are already NZD;
 * converting those again would double-count FX. */
export async function unconvertedForeignCurrencyDocumentIds(tx: Database, organisationId: string, baseCurrency: string): Promise<Set<string>> {
  return new Set((await unconvertedForeignCurrencyDocumentReferences(tx, organisationId, baseCurrency)).keys());
}

export async function unconvertedForeignCurrencyDocumentReferences(tx: Database, organisationId: string, baseCurrency: string): Promise<Map<string, string>> {
  const [invoiceRows, billRows, expenseRows, rates] = await Promise.all([
    tx.select({ id: invoices.id, baseTotal: invoices.baseTotal, baseCurrency: invoices.baseCurrency, rateId: invoices.exchangeRateId, currency: invoices.currency, rate: invoices.exchangeRate }).from(invoices).where(and(eq(invoices.organisationId, organisationId), ne(invoices.currency, baseCurrency))),
    tx.select({ id: bills.id, baseTotal: bills.baseTotal, baseCurrency: bills.baseCurrency, rateId: bills.exchangeRateId, currency: bills.currency, rate: bills.exchangeRate }).from(bills).where(and(eq(bills.organisationId, organisationId), ne(bills.currency, baseCurrency))),
    tx.select({ id: expenses.id, baseTotal: expenses.baseAmount, baseCurrency: expenses.baseCurrency, rateId: expenses.exchangeRateId, currency: expenses.currency, rate: expenses.exchangeRate }).from(expenses).where(and(eq(expenses.organisationId, organisationId), ne(expenses.currency, baseCurrency))),
    tx.select().from(exchangeRates).where(eq(exchangeRates.organisationId, organisationId)),
  ]);
  const documents = [...invoiceRows.map(row => ({ ...row, kind: 'invoice' })), ...billRows.map(row => ({ ...row, kind: 'bill' })), ...expenseRows.map(row => ({ ...row, kind: 'expense' }))];
  if (!documents.length) return new Map<string, string>();
  const sourceEntries = await tx.select({ id: journalEntries.id, kind: journalEntries.referenceType, sourceId: journalEntries.referenceId, total: journalEntries.totalAmount }).from(journalEntries)
    .where(and(eq(journalEntries.organisationId, organisationId), inArray(journalEntries.referenceType, ['invoice', 'bill', 'expense']), inArray(journalEntries.status, ['posted', 'reversed']), inArray(journalEntries.referenceId, documents.map(row => row.id))));
  const references = new Map<string, string>();
  for (const document of documents) {
    const entries = sourceEntries.filter(row => row.kind === document.kind && row.sourceId === document.id);
    const rate = rates.find(row => row.id === document.rateId && row.currencyCode === document.currency && row.baseCurrency === baseCurrency);
    const safe = document.baseCurrency === baseCurrency && rate && decimal(rate.rate).compare(document.rate) === 0
      && entries.every(entry => decimal(entry.total).compare(document.baseTotal) === 0);
    if (!safe && entries.length) {
      references.set(document.id, document.id);
      // Expense reversals reference their retained original journal, not the
      // source record. Keep both references excluded for unsafe legacy rows.
      if (document.kind === 'expense') for (const entry of entries) references.set(entry.id, document.id);
    }
  }
  // Deleted expenses retain their original/reversal journals and rate usage.
  // Expense postings have always used baseAmount since snapshots were added;
  // these retained base journals do not need a live source to remain eligible.
  return references;
}

export async function reportBusinessName(tx: Database, organisationId: string) {
 const [profile] = await tx.select({name:businessProfiles.name}).from(businessProfiles).where(eq(businessProfiles.organisationId,organisationId));
 if(profile?.name)return profile.name;
 const [org] = await tx.select({name:organisations.name}).from(organisations).where(eq(organisations.id,organisationId));return org?.name ?? 'Business';
}

export async function reportChoices(tx:Database,organisationId:string){const [chart,contacts,suppliers]=await Promise.all([tx.select({id:accounts.id,name:accounts.name}).from(accounts).where(eq(accounts.organisationId,organisationId)),tx.select({id:customers.id,name:customers.name}).from(customers).where(eq(customers.organisationId,organisationId)),tx.select({id:vendors.id,name:vendors.name}).from(vendors).where(eq(vendors.organisationId,organisationId))]);return {accounts:chart,customers:contacts,vendors:suppliers};}

export async function cashLedgerHistory(tx:Database,organisationId:string,query:FinancialReportQuery){
 const [raw,links]=await Promise.all([rawLedgerRows(tx,organisationId,{...query,from:'0001-01-01',basis:'accrual',accountIds:undefined}),cashRecognitionLinks(tx,organisationId)]);
 const recognised=recogniseCashRows(raw,links);
 return {...recognised,rows:recognised.rows.filter(row=>!query.accountIds?.length||query.accountIds.includes(row.accountId))};
}
export async function ledgerRows(tx:Database,organisationId:string,query:FinancialReportQuery,before?:string):Promise<LedgerRow[]>{
 if(query.basis!=='cash')return rawLedgerRows(tx,organisationId,query,before);
 const history=await cashLedgerHistory(tx,organisationId,query);return history.rows.filter(row=>before?row.date<before:row.date>=query.from&&row.date<=query.to);
}

/** Persistent source identities also cover reversed actions: a later undo must
 * not rewrite the grouping of a historical report. Dates stay on ledger rows. */
export async function cashFlowGroups(tx: Database, organisationId: string) {
  const actions = await tx.select({ id: bankReconciliationActions.id, journalEntryId: bankReconciliationActions.journalEntryId, transactionId: bankReconciliationActions.transactionId })
    .from(bankReconciliationActions).where(eq(bankReconciliationActions.organisationId, organisationId));
  return Object.fromEntries(actions.flatMap(action => [[action.id, action.transactionId], [action.journalEntryId, action.transactionId]]));
}
