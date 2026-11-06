import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { journalEntries } from './accounts';
import { bankTransactions } from './bank';
import { organisations, users } from './identity';
import { payments } from './payments';
import { billPayments } from './purchases';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const bankReconciliationActions = sqliteTable('bank_reconciliation_actions', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  transactionId: text('transaction_id').notNull(),
  actionType: text('action_type').notNull(),
  journalEntryId: text('journal_entry_id').notNull(),
  status: text('status').notNull().default('active'),
  reversalReason: text('reversal_reason'),
  reversedAt: timestamp('reversed_at'),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_reconciliation_actions_type_check', sql`${table.actionType} IN ('accept','personal')`),
  check('bank_reconciliation_actions_status_check', sql`${table.status} IN ('active','reversed')`),
  uniqueIndex('bank_reconciliation_actions_org_id_uidx').on(table.organisationId, table.id),
  foreignKey({ columns: [table.organisationId, table.transactionId], foreignColumns: [bankTransactions.organisationId, bankTransactions.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.journalEntryId], foreignColumns: [journalEntries.organisationId, journalEntries.id] }).onDelete('restrict'),
]);

export const bankReconciliationActionItems = sqliteTable('bank_reconciliation_action_items', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  actionId: text('action_id').notNull(),
  documentType: text('document_type').notNull(),
  documentId: text('document_id').notNull(),
  paymentId: text('payment_id'),
  billPaymentId: text('bill_payment_id'),
  amount: text('amount').notNull(),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bank_reconciliation_action_items_type_check', sql`${table.documentType} IN ('invoice','bill')`),
  uniqueIndex('bank_reconciliation_action_items_org_id_uidx').on(table.organisationId, table.id),
  index('bank_reconciliation_action_items_action_idx').on(table.organisationId, table.actionId),
  foreignKey({ columns: [table.organisationId, table.actionId], foreignColumns: [bankReconciliationActions.organisationId, bankReconciliationActions.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.organisationId, table.paymentId], foreignColumns: [payments.organisationId, payments.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.billPaymentId], foreignColumns: [billPayments.organisationId, billPayments.id] }).onDelete('restrict'),
]);
