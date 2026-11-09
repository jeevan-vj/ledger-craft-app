import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';
import { accountTemplates, accounts, accountContacts, journalEntries, journalEntryLines } from './schema/accounts';
import { creditNotes, creditNoteLines, creditNoteRefunds } from './schema/credit-notes';
import { businessProfiles } from './schema/business-profiles';
import { customers } from './schema/customers';
import {
  activeOrganisationSelections,
  accountDeletionTombstones,
  authAccounts,
  organisationInvitations,
  organisationMemberships,
  organisations,
  sessions,
  users,
  verifications,
} from './schema/identity';
import { invoiceAttachments, invoiceHistory, invoices, lineItems } from './schema/invoices';
import { quoteLineItems, quotes, sharedQuotes } from './schema/quotes';
import { itemCategories, items } from './schema/items';
import {
  bankAccounts,
  bankMatchingRules,
  bankTransactionAttachments,
  bankTransactionDocumentConnections,
  bankTransactionSplits,
  bankTransactions,
  bankTransfers,
  transactionImportBatches,
} from './schema/bank';
import { bankReconciliationActionItems, bankReconciliationActions } from './schema/reconciliation-actions';
import { expenseCategories, expenses } from './schema/expenses';
import { payments } from './schema/payments';
import { reconciliationAdjustments, reconciliationMatches, reconciliationSessions, reconciliationSupplierPaymentLinks } from './schema/reconciliation';
import { receipts } from './schema/receipts';
import { conversationMessages, conversations } from './schema/conversations';
import { assistantEvents } from './schema/assistant-events';
import { taxConfigurations, taxReturns, taxAdjustments } from './schema/tax';
import { idempotencyKeys } from './schema/idempotency';
import { rlsProbe } from './schema/probe';
import { sharedInvoices } from './schema/shared-invoices';
import { billLines, billPayments, bills, vendors } from './schema/purchases';
import { recurringRuns, recurringTemplates } from './schema/recurring';
import { exchangeRates, exchangeRateUsage, organisationCurrencies, organisationLocalizationSettings } from './schema/currency';
import { dashboardLayouts, savedReportDefinitions } from './schema/dashboards';
import { importBatches, importDocumentEvents, importDocuments } from './schema/invoice-imports';
import { stripeAccountRoutes, stripeConnectedAccounts, stripeEvents, stripePaymentLinks } from './schema/stripe';

import { bankPreferences } from './schema/bank-preferences';
import { reminderSettings, reminderOptOuts, reminderLogs, statementShares } from './schema/customer-collections';
import { bankFeedConnections, bankFeedAccounts, bankFeedTransactions } from './schema/bank-feeds';
import { stripeRateLimits, stripeVerificationState, stripeVerifications } from './schema/stripe';

export const schema = {
  bankPreferences, reminderSettings, reminderOptOuts, reminderLogs, statementShares,
  bankFeedConnections, bankFeedAccounts, bankFeedTransactions, stripeVerifications, stripeRateLimits, stripeVerificationState,
  creditNotes,
  creditNoteLines,
  creditNoteRefunds,
  rlsProbe,
  users,
  sessions,
  authAccounts,
  verifications,
  organisations,
  organisationMemberships,
  activeOrganisationSelections,
  accountDeletionTombstones,
  organisationInvitations,
  customers,
  businessProfiles,
  itemCategories,
  items,
  invoices,
  lineItems,
  invoiceHistory,
  invoiceAttachments,
  quotes,
  quoteLineItems,
  sharedQuotes,
  accounts,
  accountContacts,
  accountTemplates,
  journalEntries,
  journalEntryLines,
  expenseCategories,
  expenses,
  payments,
  receipts,
  conversations,
  conversationMessages,
  assistantEvents,
  bankAccounts,
  bankMatchingRules,
  bankReconciliationActions,
  bankReconciliationActionItems,
  bankTransactions,
  bankTransactionSplits,
  bankTransactionDocumentConnections,
  bankTransactionAttachments,
  bankTransfers,
  transactionImportBatches,
  reconciliationSessions,
  reconciliationMatches,
  reconciliationSupplierPaymentLinks,
  reconciliationAdjustments,
  taxConfigurations,
  taxReturns,
  taxAdjustments,
  idempotencyKeys,
  sharedInvoices,
  vendors,
  bills,
  billLines,
  billPayments,
  recurringTemplates,
  recurringRuns,
  organisationLocalizationSettings,
  organisationCurrencies,
  exchangeRates,
  exchangeRateUsage,
  dashboardLayouts,
  savedReportDefinitions,
  importBatches,
  importDocuments,
  importDocumentEvents,
  stripeConnectedAccounts,
  stripeAccountRoutes,
  stripePaymentLinks,
  stripeEvents,
};


export interface SQLiteAdapter {
  query(sql: string, params: unknown[], method: 'run' | 'all' | 'values' | 'get'): Promise<{ rows: unknown[] }>;
  execute<T>(sql: string, params: unknown[]): Promise<T[]>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}
export type Database = Omit<SqliteRemoteDatabase<typeof schema>, 'transaction'> & {
  transaction<T>(callback: (tx: Database) => Promise<T>): Promise<T>;
  execute<T = Record<string, unknown>>(query: SQL): Promise<T[]>;
};

/** Keep transaction ownership in the storage engine; DO SQL forbids BEGIN/SAVEPOINT. */
export function createDatabase(adapter: SQLiteAdapter): Database {
  const dialect = new SQLiteAsyncDialect();
  const db = drizzle(adapter.query.bind(adapter), { schema }) as unknown as Database;
  db.transaction = (callback) => adapter.transaction(() => callback(db));
  db.execute = <T>(query: SQL) => {
    const compiled = dialect.sqlToQuery(query);
    return adapter.execute<T>(compiled.sql, compiled.params);
  };
  return db;
}
