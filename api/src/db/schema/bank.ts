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

export const bankTransfers = sqliteTable('bank_transfers', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  sourceAccountId: text('source_account_id').notNull(),
  destinationAccountId: text('destination_account_id').notNull(),
  transactionDate: text('transaction_date').notNull(),
  amount: money('amount').notNull(),
  currency: text('currency').notNull(),
  destinationCurrency: text('destination_currency').notNull().default('NZD'),
  destinationAmount: money('destination_amount').notNull().default('0'),
  exchangeRate: text('exchange_rate').notNull().default('1'),
  exchangeRateId: text('exchange_rate_id'),
  description: text('description').notNull(),
  reference: text('reference'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_transfers_distinct_accounts_check', sql`source_account_id <> destination_account_id`),
  check('bank_transfers_amount_check', sql`amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND length(amount) - length(replace(amount, '.', '')) <= 1 AND trim(amount, '0.') <> ''`),
  uniqueIndex('bank_transfers_org_id_uidx').on(table.organisationId, table.id),
  index('bank_transfers_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.sourceAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.destinationAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('restrict'),
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
  source: text('source').notNull().default('import'),
  paymentMethod: text('payment_method'),
  counterparty: text('counterparty'),
  transferId: text('transfer_id'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_transactions_type_check', sql`type IN ('debit', 'credit')`),
  check('bank_transactions_source_check', sql`source IN ('import', 'manual', 'transfer')`),
  check('bank_transactions_payment_method_check', sql`payment_method IS NULL OR payment_method IN ('bank_transfer', 'cash', 'card', 'cheque', 'other')`),
  uniqueIndex('bank_transactions_org_id_uidx').on(table.organisationId, table.id),
  index('bank_transactions_org_idx').on(table.organisationId),
  index('bank_transactions_transfer_idx').on(table.organisationId, table.transferId),
  foreignKey({ columns: [table.organisationId, table.bankAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.organisationId, table.transferId], foreignColumns: [bankTransfers.organisationId, bankTransfers.id] }).onDelete('restrict'),
]);

export const bankTransactionSplits = sqliteTable('bank_transaction_splits', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  transactionId: text('transaction_id').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  amount: money('amount').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_transaction_splits_amount_check', sql`amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND trim(amount, '0.') <> ''`),
  uniqueIndex('bank_transaction_splits_org_id_uidx').on(table.organisationId, table.id),
  index('bank_transaction_splits_tx_idx').on(table.organisationId, table.transactionId),
  foreignKey({ columns: [table.organisationId, table.transactionId], foreignColumns: [bankTransactions.organisationId, bankTransactions.id] }).onDelete('cascade'),
]);

export const bankTransactionDocumentConnections = sqliteTable('bank_transaction_document_connections', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  transactionId: text('transaction_id').notNull(),
  documentType: text('document_type').notNull(),
  documentId: text('document_id').notNull(),
  documentNumber: text('document_number').notNull(),
  amount: money('amount').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_transaction_connections_type_check', sql`document_type IN ('invoice', 'bill')`),
  check('bank_transaction_connections_amount_check', sql`amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND trim(amount, '0.') <> ''`),
  uniqueIndex('bank_transaction_connections_org_id_uidx').on(table.organisationId, table.id),
  uniqueIndex('bank_transaction_connections_doc_uidx').on(table.organisationId, table.transactionId, table.documentType, table.documentId),
  index('bank_transaction_connections_tx_idx').on(table.organisationId, table.transactionId),
  foreignKey({ columns: [table.organisationId, table.transactionId], foreignColumns: [bankTransactions.organisationId, bankTransactions.id] }).onDelete('restrict'),
]);

export const bankTransactionAttachments = sqliteTable('bank_transaction_attachments', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  transactionId: text('transaction_id').notNull(),
  objectKey: text('object_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_transaction_attachments_size_check', sql`size > 0 AND size <= 1048576`),
  uniqueIndex('bank_transaction_attachments_org_id_uidx').on(table.organisationId, table.id),
  uniqueIndex('bank_transaction_attachments_object_uidx').on(table.organisationId, table.objectKey),
  index('bank_transaction_attachments_tx_idx').on(table.organisationId, table.transactionId),
  foreignKey({ columns: [table.organisationId, table.transactionId], foreignColumns: [bankTransactions.organisationId, bankTransactions.id] }).onDelete('cascade'),
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
