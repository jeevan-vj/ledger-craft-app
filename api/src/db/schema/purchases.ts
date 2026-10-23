import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { bankAccounts } from './bank';
import { organisations, users } from './identity';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const money = (name: string) => text(name);
const moneyCheck = (column: ReturnType<typeof text>) =>
  sql`${column} <> '' AND ${column} NOT GLOB '*[^0-9.]*' AND ${column} GLOB '[0-9]*' AND ${column} NOT LIKE '%.' AND length(${column}) - length(replace(${column}, '.', '')) <= 1`;

export const vendors = sqliteTable('vendors', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  taxId: text('tax_id'),
  address: text('address'),
  paymentTermDays: integer('payment_term_days').notNull().default(20),
  notes: text('notes'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  contactName: text('contact_name'),
  defaultAccountId: text('default_account_id'),
  defaultTaxRate: money('default_tax_rate').notNull().default('15'),
  importIdentifier: text('import_identifier'),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('vendors_payment_term_days_check', sql`${table.paymentTermDays} >= 0 AND ${table.paymentTermDays} <= 365`),
  uniqueIndex('vendors_org_id_uidx').on(table.organisationId, table.id),
  index('vendors_org_name_idx').on(table.organisationId, table.name),
  uniqueIndex('vendors_org_import_identifier_uidx').on(table.organisationId, table.importIdentifier),
]);

export const bills = sqliteTable('bills', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  billNumber: text('bill_number').notNull(),
  vendorId: text('vendor_id').notNull(),
  vendorReference: text('vendor_reference'),
  issueDate: text('issue_date').notNull(),
  dueDate: text('due_date').notNull(),
  lifecycleStatus: text('lifecycle_status').notNull().default('draft'),
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  currency: text('currency').notNull().default('NZD'),
  exchangeRate: text('exchange_rate').notNull().default('1'),
  exchangeRateId: text('exchange_rate_id'),
  baseCurrency: text('base_currency').notNull().default('NZD'),
  baseSubtotal: money('base_subtotal').notNull().default('0'),
  baseTaxAmount: money('base_tax_amount').notNull().default('0'),
  baseTotal: money('base_total').notNull().default('0'),
  taxInclusive: integer('tax_inclusive', { mode: 'boolean' }).notNull().default(true),
  subtotal: money('subtotal').notNull(),
  taxAmount: money('tax_amount').notNull(),
  total: money('total').notNull(),
  totalPaid: money('total_paid').notNull().default('0'),
  balanceDue: money('balance_due').notNull(),
  notes: text('notes'),
  receivedAt: timestamp('received_at'),
  voidedAt: timestamp('voided_at'),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bills_lifecycle_status_check', sql`${table.lifecycleStatus} IN ('draft', 'received', 'void')`),
  check('bills_payment_status_check', sql`${table.paymentStatus} IN ('unpaid', 'partial', 'paid')`),
  check('bills_subtotal_check', moneyCheck(table.subtotal)),
  check('bills_tax_amount_check', moneyCheck(table.taxAmount)),
  check('bills_total_check', moneyCheck(table.total)),
  check('bills_total_paid_check', moneyCheck(table.totalPaid)),
  check('bills_balance_due_check', moneyCheck(table.balanceDue)),
  uniqueIndex('bills_org_id_uidx').on(table.organisationId, table.id),
  uniqueIndex('bills_org_number_uidx').on(table.organisationId, table.billNumber),
  index('bills_org_due_date_idx').on(table.organisationId, table.dueDate),
  foreignKey({ columns: [table.organisationId, table.vendorId], foreignColumns: [vendors.organisationId, vendors.id] }).onDelete('restrict'),
]);

export const billLines = sqliteTable('bill_lines', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  billId: text('bill_id').notNull(),
  description: text('description').notNull(),
  quantity: money('quantity').notNull(),
  unitPrice: money('unit_price').notNull(),
  taxRate: money('tax_rate').notNull().default('15'),
  subtotal: money('subtotal').notNull(),
  taxAmount: money('tax_amount').notNull(),
  total: money('total').notNull(),
  accountId: text('account_id'),
  lineOrder: integer('line_order').notNull(),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bill_lines_quantity_check', moneyCheck(table.quantity)),
  check('bill_lines_unit_price_check', moneyCheck(table.unitPrice)),
  check('bill_lines_tax_rate_check', moneyCheck(table.taxRate)),
  check('bill_lines_subtotal_check', moneyCheck(table.subtotal)),
  check('bill_lines_tax_amount_check', moneyCheck(table.taxAmount)),
  check('bill_lines_total_check', moneyCheck(table.total)),
  uniqueIndex('bill_lines_org_id_uidx').on(table.organisationId, table.id),
  index('bill_lines_org_bill_idx').on(table.organisationId, table.billId),
  foreignKey({ columns: [table.organisationId, table.billId], foreignColumns: [bills.organisationId, bills.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.organisationId, table.accountId], foreignColumns: [accounts.organisationId, accounts.id] }).onDelete('restrict'),
]);

export const billPayments = sqliteTable('bill_payments', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  billId: text('bill_id').notNull(),
  bankAccountId: text('bank_account_id').notNull(),
  amount: money('amount').notNull(),
  paymentDate: text('payment_date').notNull(),
  referenceNumber: text('reference_number'),
  notes: text('notes'),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bill_payments_amount_check', moneyCheck(table.amount)),
  uniqueIndex('bill_payments_org_id_uidx').on(table.organisationId, table.id),
  index('bill_payments_org_bill_idx').on(table.organisationId, table.billId),
  foreignKey({ columns: [table.organisationId, table.billId], foreignColumns: [bills.organisationId, bills.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.bankAccountId], foreignColumns: [bankAccounts.organisationId, bankAccounts.id] }).onDelete('restrict'),
]);

export const billAttachments = sqliteTable('bill_attachments', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  billId: text('bill_id').notNull(),
  objectKey: text('object_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bill_attachments_size_check', sql`${table.size} >= 0 AND ${table.size} <= 1048576`),
  uniqueIndex('bill_attachments_org_id_uidx').on(table.organisationId, table.id),
  uniqueIndex('bill_attachments_org_object_uidx').on(table.organisationId, table.objectKey),
  foreignKey({ columns: [table.organisationId, table.billId], foreignColumns: [bills.organisationId, bills.id] }).onDelete('cascade'),
]);

export const billHistory = sqliteTable('bill_history', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  billId: text('bill_id').notNull(),
  event: text('event').notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('bill_history_event_check', sql`${table.event} IN ('created','updated','received','cancelled','restored','payment_recorded','attachment_added','attachment_removed')`),
  uniqueIndex('bill_history_org_id_uidx').on(table.organisationId, table.id),
  index('bill_history_org_bill_idx').on(table.organisationId, table.billId, table.createdAt),
  foreignKey({ columns: [table.organisationId, table.billId], foreignColumns: [bills.organisationId, bills.id] }).onDelete('cascade'),
]);
