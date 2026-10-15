import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });
// Decimal values remain exact strings; arithmetic belongs to the server decimal helpers.
const money = (name: string) => text(name);

export const bankAccounts = sqliteTable('bank_accounts', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  accountName: text('account_name').notNull(),
  accountNumber: text('account_number').notNull(),
  bankName: text('bank_name').notNull(),
  accountType: text('account_type').notNull(),
  currency: text('currency').notNull().default('NZD'),
  openingBalance: money('opening_balance').notNull().default('0'),
  currentBalance: money('current_balance').notNull().default('0'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_accounts_account_type_check', sql`account_type IN ('checking', 'savings', 'credit_card', 'business')`),
  uniqueIndex('bank_accounts_org_id_uidx').on(table.organisationId, table.id),
  index('bank_accounts_org_idx').on(table.organisationId),
]);

export const bankTransactions = sqliteTable('bank_transactions', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  bankAccountId: text('bank_account_id').notNull(),
  transactionDate: text('transaction_date').notNull(),
  description: text('description').notNull(),
  reference: text('reference'),
  amount: money('amount').notNull(),
  type: text('type').notNull(),
  balance: money('balance'),
  category: text('category'),
  merchant: text('merchant'),
  isReconciled: integer('is_reconciled', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_transactions_type_check', sql`type IN ('debit', 'credit')`),
  uniqueIndex('bank_transactions_org_id_uidx').on(table.organisationId, table.id),
  index('bank_transactions_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.bankAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('cascade'),
]);

export const transactionImportBatches = sqliteTable('transaction_import_batches', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  bankAccountId: text('bank_account_id').notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size'),
  totalRows: integer('total_rows').notNull().default(0),
  importedCount: integer('imported_count').notNull().default(0),
  duplicatesSkipped: integer('duplicates_skipped').notNull().default(0),
  errorsCount: integer('errors_count').notNull().default(0),
  earliestDate: text('earliest_date'),
  latestDate: text('latest_date'),
  status: text('status').notNull().default('completed'),
  errorMessage: text('error_message'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  completedAt: timestamptz('completed_at'),
}, (table) => [
  check('transaction_import_batches_file_type_check', sql`file_type IN ('csv', 'ofx', 'qif', 'pdf')`),
  check('transaction_import_batches_status_check', sql`status IN ('processing', 'completed', 'failed', 'partially_failed')`),
  uniqueIndex('transaction_import_batches_org_id_uidx').on(table.organisationId, table.id),
  index('transaction_import_batches_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.bankAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('cascade'),
]);
