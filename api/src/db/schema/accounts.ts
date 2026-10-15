import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });
// Decimal values remain exact strings; arithmetic belongs to the server decimal helpers.
const money = (name: string) => text(name);

export const accounts = sqliteTable('accounts', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  type: text('type').notNull(),
  currency: text('currency').notNull().default('NZD'),
  openingBalance: money('opening_balance').notNull().default('0'),
  currentBalance: money('current_balance').notNull().default('0'),
  accountNumber: text('account_number'),
  accountClass: text('account_class'),
  normalBalance: text('normal_balance'),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  parentAccountId: text('parent_account_id'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('accounts_normal_balance_check', sql`normal_balance IN ('debit', 'credit')`),
  uniqueIndex('accounts_org_id_uidx').on(table.organisationId, table.id),
  index('accounts_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.parentAccountId], foreignColumns: [table.organisationId, table.id] }).onDelete('restrict'),
]);

export const journalEntries = sqliteTable('journal_entries', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  entryNumber: text('entry_number').notNull(),
  entryDate: text('entry_date').notNull(),
  description: text('description').notNull(),
  referenceType: text('reference_type'),
  referenceId: text('reference_id'),
  totalAmount: money('total_amount').notNull(),
  status: text('status').notNull().default('posted'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('journal_entries_total_amount_check', sql`total_amount <> '' AND total_amount NOT GLOB '*[^0-9.]*' AND total_amount GLOB '[0-9]*' AND total_amount NOT LIKE '%.' AND length(total_amount) - length(replace(total_amount, '.', '')) <= 1`),
  check('journal_entries_status_check', sql`status IN ('draft', 'posted', 'reversed')`),
  uniqueIndex('journal_entries_org_id_uidx').on(table.organisationId, table.id),
  index('journal_entries_org_idx').on(table.organisationId),
  uniqueIndex('journal_entries_organisationId_entryNumber_uidx').on(table.organisationId, table.entryNumber),
]);

export const accountTemplates = sqliteTable('account_templates', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  name: text('name').notNull(),
  accountNumber: text('account_number').notNull(),
  accountClass: text('account_class').notNull(),
  accountType: text('account_type').notNull(),
  normalBalance: text('normal_balance').notNull(),
  description: text('description'),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(true),
  countryCode: text('country_code').notNull().default('NZ'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('account_templates_normal_balance_check', sql`normal_balance IN ('debit', 'credit')`),
  uniqueIndex('account_templates_countryCode_accountNumber_uidx').on(table.countryCode, table.accountNumber),
]);

export const journalEntryLines = sqliteTable('journal_entry_lines', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  journalEntryId: text('journal_entry_id').notNull(),
  accountId: text('account_id').notNull(),
  description: text('description'),
  debitAmount: money('debit_amount').notNull().default('0'),
  creditAmount: money('credit_amount').notNull().default('0'),
  lineOrder: integer('line_order').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('journal_entry_lines_debit_amount_check', sql`debit_amount <> '' AND debit_amount NOT GLOB '*[^0-9.]*' AND debit_amount GLOB '[0-9]*' AND debit_amount NOT LIKE '%.' AND length(debit_amount) - length(replace(debit_amount, '.', '')) <= 1`),
  check('journal_entry_lines_credit_amount_check', sql`credit_amount <> '' AND credit_amount NOT GLOB '*[^0-9.]*' AND credit_amount GLOB '[0-9]*' AND credit_amount NOT LIKE '%.' AND length(credit_amount) - length(replace(credit_amount, '.', '')) <= 1`),
  uniqueIndex('journal_entry_lines_org_id_uidx').on(table.organisationId, table.id),
  index('journal_entry_lines_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.journalEntryId], foreignColumns: [journalEntries.organisationId, journalEntries.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.organisationId, table.accountId], foreignColumns: [accounts.organisationId, accounts.id] }).onDelete('restrict'),
]);

export const accountContacts = sqliteTable('account_contacts', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  type: text('type').notNull(),
  organization: text('organization'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('account_contacts_org_id_uidx').on(table.organisationId, table.id),
  index('account_contacts_org_idx').on(table.organisationId),
]);
