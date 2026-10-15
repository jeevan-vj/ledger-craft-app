import { journalEntries } from './accounts';
import { bankAccounts, bankTransactions } from './bank';
import { expenses } from './expenses';
import { organisations, users } from './identity';
import { invoices } from './invoices';
import { payments } from './payments';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });
// Decimal values remain exact strings; arithmetic belongs to the server decimal helpers.
const money = (name: string) => text(name);

export const reconciliationSessions = sqliteTable('reconciliation_sessions', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  bankAccountId: text('bank_account_id').notNull(),
  statementStartDate: text('statement_start_date').notNull(),
  statementEndDate: text('statement_end_date').notNull(),
  statementOpeningBalance: money('statement_opening_balance').notNull(),
  statementClosingBalance: money('statement_closing_balance').notNull(),
  bookOpeningBalance: money('book_opening_balance').notNull(),
  bookClosingBalance: money('book_closing_balance'),
  totalDeposits: money('total_deposits').notNull().default('0'),
  totalWithdrawals: money('total_withdrawals').notNull().default('0'),
  status: text('status').notNull().default('in_progress'),
  reconciledAt: timestamptz('reconciled_at'),
  matchedCount: integer('matched_count').notNull().default(0),
  unmatchedBankCount: integer('unmatched_bank_count').notNull().default(0),
  unmatchedBookCount: integer('unmatched_book_count').notNull().default(0),
  adjustmentCount: integer('adjustment_count').notNull().default(0),
  difference: money('difference').notNull().default('0'),
  notes: text('notes'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('reconciliation_sessions_status_check', sql`status IN ('in_progress', 'completed', 'locked')`),
  uniqueIndex('reconciliation_sessions_org_id_uidx').on(table.organisationId, table.id),
  index('reconciliation_sessions_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.bankAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('cascade'),
]);

export const reconciliationMatches = sqliteTable('reconciliation_matches', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  reconciliationId: text('reconciliation_id').notNull(),
  bankTransactionId: text('bank_transaction_id'),
  invoiceId: text('invoice_id'),
  paymentId: text('payment_id'),
  expenseId: text('expense_id'),
  journalEntryId: text('journal_entry_id'),
  matchType: text('match_type').notNull(),
  confidenceScore: text('confidence_score').notNull().default('0'),
  bankAmount: money('bank_amount'),
  bookAmount: money('book_amount'),
  difference: money('difference').notNull().default('0'),
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  matchedBy: text('matched_by'),
  matchedAt: timestamptz('matched_at').default(sql`(unixepoch() * 1000)`).notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('reconciliation_matches_status_check', sql`status IN ('pending', 'confirmed', 'rejected', 'adjusted')`),
  uniqueIndex('reconciliation_matches_org_id_uidx').on(table.organisationId, table.id),
  index('reconciliation_matches_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.reconciliationId], foreignColumns: [reconciliationSessions.organisationId, reconciliationSessions.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.organisationId, table.bankTransactionId], foreignColumns: [bankTransactions.organisationId, bankTransactions.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.invoiceId], foreignColumns: [invoices.organisationId, invoices.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.paymentId], foreignColumns: [payments.organisationId, payments.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.expenseId], foreignColumns: [expenses.organisationId, expenses.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.journalEntryId], foreignColumns: [journalEntries.organisationId, journalEntries.id] }).onDelete('restrict'),
]);

export const reconciliationAdjustments = sqliteTable('reconciliation_adjustments', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  reconciliationId: text('reconciliation_id').notNull(),
  adjustmentType: text('adjustment_type').notNull(),
  description: text('description').notNull(),
  amount: money('amount').notNull(),
  affectsBank: integer('affects_bank', { mode: 'boolean' }).notNull().default(false),
  affectsBook: integer('affects_book', { mode: 'boolean' }).notNull().default(false),
  referenceType: text('reference_type'),
  referenceId: text('reference_id'),
  referenceNumber: text('reference_number'),
  journalEntryId: text('journal_entry_id'),
  status: text('status').notNull().default('pending'),
  appliedAt: timestamptz('applied_at'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('reconciliation_adjustments_status_check', sql`status IN ('pending', 'applied', 'reversed')`),
  uniqueIndex('reconciliation_adjustments_org_id_uidx').on(table.organisationId, table.id),
  index('reconciliation_adjustments_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.reconciliationId], foreignColumns: [reconciliationSessions.organisationId, reconciliationSessions.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.organisationId, table.journalEntryId], foreignColumns: [journalEntries.organisationId, journalEntries.id] }).onDelete('restrict'),
]);
