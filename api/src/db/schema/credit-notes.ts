import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations, users } from './identity';
import { invoices } from './invoices';
import { bankAccounts } from './bank';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
export const creditNotes = sqliteTable('credit_notes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  invoiceId: text('invoice_id').notNull(), customerId: text('customer_id').notNull(), creditNoteNumber: text('credit_note_number').notNull(),
  issueDate: text('issue_date').notNull(), reason: text('reason').notNull(), status: text('status').notNull().default('issued'),
  reversalDate: text('reversal_date'), reversalReason: text('reversal_reason'),
  currency: text('currency').notNull(), exchangeRate: text('exchange_rate').notNull(), exchangeRateId: text('exchange_rate_id'), baseCurrency: text('base_currency').notNull(),
  subtotal: text('subtotal').notNull(), taxAmount: text('tax_amount').notNull(), total: text('total').notNull(),
  baseTotal: text('base_total').notNull(), baseTaxAmount: text('base_tax_amount').notNull(),
  receivableAmount: text('receivable_amount').notNull(), baseReceivableAmount: text('base_receivable_amount').notNull(),
  customerCreditAmount: text('customer_credit_amount').notNull(), baseCustomerCreditAmount: text('base_customer_credit_amount').notNull(), baseCustomerCreditTaxAmount: text('base_customer_credit_tax_amount').notNull(),
  refundedAmount: text('refunded_amount').notNull().default('0.00'), baseRefundedAmount: text('base_refunded_amount').notNull().default('0.00'),
  createdAt: timestamp('created_at').notNull().default(sql`(unixepoch() * 1000)`), updatedAt: timestamp('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
}, table => [
  uniqueIndex('credit_notes_org_id_uidx').on(table.organisationId, table.id),
  uniqueIndex('credit_notes_org_number_uidx').on(table.organisationId, table.creditNoteNumber),
  index('credit_notes_invoice_idx').on(table.organisationId, table.invoiceId),
  check('credit_notes_status_check', sql`${table.status} IN ('issued','reversed')`),
  foreignKey({ columns: [table.organisationId, table.invoiceId], foreignColumns: [invoices.organisationId, invoices.id] }).onDelete('restrict'),
]);
export const creditNoteLines = sqliteTable('credit_note_lines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), organisationId: text('organisation_id').notNull().references(() => organisations.id),
  creditNoteId: text('credit_note_id').notNull(), lineOrder: integer('line_order').notNull(), data: text('data', { mode: 'json' }).notNull(),
}, table => [
  index('credit_note_lines_source_idx').on(table.organisationId, table.creditNoteId),
  foreignKey({ columns: [table.organisationId, table.creditNoteId], foreignColumns: [creditNotes.organisationId, creditNotes.id] }).onDelete('restrict'),
]);
export const creditNoteRefunds = sqliteTable('credit_note_refunds', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id), creditNoteId: text('credit_note_id').notNull(), bankAccountId: text('bank_account_id').notNull(),
  amount: text('amount').notNull(), refundDate: text('refund_date').notNull(), currency: text('currency').notNull(), baseCurrency: text('base_currency').notNull(),
  exchangeRate: text('exchange_rate').notNull(), exchangeRateId: text('exchange_rate_id'), baseAmount: text('base_amount').notNull(), bookBaseAmount: text('book_base_amount').notNull(), exchangeDifference: text('exchange_difference').notNull(),
  reference: text('reference'), status: text('status').notNull().default('completed'), reversalDate: text('reversal_date'), reversalReason: text('reversal_reason'),
  createdAt: timestamp('created_at').notNull().default(sql`(unixepoch() * 1000)`),
}, table => [
  uniqueIndex('credit_note_refunds_org_id_uidx').on(table.organisationId, table.id),
  index('credit_note_refunds_source_idx').on(table.organisationId, table.creditNoteId),
  check('credit_note_refunds_status_check', sql`${table.status} IN ('completed','reversed')`),
  foreignKey({ columns: [table.organisationId, table.creditNoteId], foreignColumns: [creditNotes.organisationId, creditNotes.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.bankAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('restrict'),
]);
