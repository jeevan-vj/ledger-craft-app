import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';
import { accountTemplates, accounts, accountContacts, journalEntries, journalEntryLines } from './schema/accounts';
import { businessProfiles } from './schema/business-profiles';
import { customers } from './schema/customers';
import {
  activeOrganisationSelections,
  authAccounts,
  organisationInvitations,
  organisationMemberships,
  organisations,
  sessions,
  users,
  verifications,
} from './schema/identity';
import { invoices, lineItems } from './schema/invoices';
import { quoteLineItems, quotes, sharedQuotes } from './schema/quotes';
import { itemCategories, items } from './schema/items';
import {
  bankAccounts,
  bankTransactionAttachments,
  bankTransactionDocumentConnections,
  bankTransactionSplits,
  bankTransactions,
  bankTransfers,
  transactionImportBatches,
} from './schema/bank';
import { expenseCategories, expenses } from './schema/expenses';
import { payments } from './schema/payments';
import { reconciliationAdjustments, reconciliationMatches, reconciliationSessions } from './schema/reconciliation';
import { receipts } from './schema/receipts';
import { conversationMessages, conversations } from './schema/conversations';
import { taxConfigurations, taxReturns, taxAdjustments } from './schema/tax';
import { idempotencyKeys } from './schema/idempotency';
import { rlsProbe } from './schema/probe';
import { sharedInvoices } from './schema/shared-invoices';
import { billLines, billPayments, bills, vendors } from './schema/purchases';
import { exchangeRates, exchangeRateUsage, organisationCurrencies, organisationLocalizationSettings } from './schema/currency';

export const schema = {
  rlsProbe,
  users,
  sessions,
  authAccounts,
  verifications,
  organisations,
  organisationMemberships,
  activeOrganisationSelections,
  organisationInvitations,
  customers,
  businessProfiles,
  itemCategories,
  items,
  invoices,
  lineItems,
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
  bankAccounts,
  bankTransactions,
  bankTransactionSplits,
  bankTransactionDocumentConnections,
  bankTransactionAttachments,
  bankTransfers,
  transactionImportBatches,
  reconciliationSessions,
  reconciliationMatches,
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
  organisationLocalizationSettings,
  organisationCurrencies,
  exchangeRates,
  exchangeRateUsage,
};


export interface SQLiteAdapter {
  query(sql: string, params: unknown[], method: 'run' | 'all' | 'values' | 'get'): Promise<{ rows: any[] }>;
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
