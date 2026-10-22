import { accounts } from './accounts';
import { customers } from './customers';
import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });
// Decimal values remain exact strings; arithmetic belongs to the server decimal helpers.
const money = (name: string) => text(name);

export const expenseCategories = sqliteTable('expense_categories', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('expense_categories_org_id_uidx').on(table.organisationId, table.id),
  index('expense_categories_org_idx').on(table.organisationId),
]);

export const expenses = sqliteTable('expenses', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  description: text('description').notNull(),
  amount: money('amount').notNull(),
  categoryId: text('category_id'),
  accountId: text('account_id'),
  vendorName: text('vendor_name'),
  receiptUrl: text('receipt_url'),
  expenseDate: text('expense_date').notNull(),
  status: text('status').notNull().default('pending'),
  isBillable: integer('is_billable', { mode: 'boolean' }).notNull().default(false),
  customerId: text('customer_id'),
  taxAmount: money('tax_amount').notNull().default('0'),
  currency: text('currency').notNull().default('NZD'),
  exchangeRate: text('exchange_rate').notNull().default('1'),
  exchangeRateId: text('exchange_rate_id'),
  baseCurrency: text('base_currency').notNull().default('NZD'),
  baseAmount: money('base_amount').notNull().default('0'),
  baseTaxAmount: money('base_tax_amount').notNull().default('0'),
  paymentMethod: text('payment_method'),
  notes: text('notes'),
  gstTreatment: text('gst_treatment').notNull().default('standard'),
  gstExemptionReason: text('gst_exemption_reason').notNull().default('none'),
  gstClaimablePercentage: integer('gst_claimable_percentage').notNull().default(100),
  privateUsePercentage: integer('private_use_percentage').notNull().default(0),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('expenses_amount_check', sql`amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND length(amount) - length(replace(amount, '.', '')) <= 1`),
  check('expenses_tax_amount_check', sql`tax_amount <> '' AND tax_amount NOT GLOB '*[^0-9.]*' AND tax_amount GLOB '[0-9]*' AND tax_amount NOT LIKE '%.' AND length(tax_amount) - length(replace(tax_amount, '.', '')) <= 1`),
  check('expenses_status_check', sql`status IN ('pending', 'approved', 'rejected')`),
  check('expenses_gst_treatment_check', sql`gst_treatment IN ('standard', 'zero_rated', 'exempt', 'partial', 'private_use')`),
  check('expenses_gst_exemption_reason_check', sql`gst_exemption_reason IN ('none', 'motor_vehicle', 'financial_services', 'residential_rent', 'insurance_life', 'exported_services', 'entertainment_50', 'home_office', 'second_hand_goods', 'other_exempt')`),
  check('expenses_gst_claimable_percentage_check', sql`gst_claimable_percentage >= 0 AND gst_claimable_percentage <= 100`),
  check('expenses_private_use_percentage_check', sql`private_use_percentage >= 0 AND private_use_percentage <= 100`),
  uniqueIndex('expenses_org_id_uidx').on(table.organisationId, table.id),
  index('expenses_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.categoryId], foreignColumns: [expenseCategories.organisationId, expenseCategories.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.accountId], foreignColumns: [accounts.organisationId, accounts.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.customerId], foreignColumns: [customers.organisationId, customers.id] }).onDelete('restrict'),
]);
