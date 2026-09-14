import { customers } from './customers';
import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });
// Decimal values remain exact strings; arithmetic belongs to the server decimal helpers.
const money = (name: string) => text(name);

export const invoices = sqliteTable('invoices', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  invoiceNumber: text('invoice_number').notNull(),
  customerId: text('customer_id').notNull(),
  date: text('date').notNull(),
  dueDate: text('due_date').notNull(),
  paymentTermDays: integer('payment_term_days'),
  subtotal: money('subtotal').notNull(),
  taxAmount: money('tax_amount').notNull(),
  discountType: text('discount_type').notNull().default('fixed'),
  discountPercent: text('discount_percent'),
  discount: money('discount'),
  additionalCharges: money('additional_charges'),
  additionalChargesList: text('additional_charges_list', { mode: 'json' }),
  additionalChargesTotal: money('additional_charges_total'),
  total: money('total').notNull(),
  totalPaid: money('total_paid').notNull().default('0'),
  balanceDue: money('balance_due').notNull().default('0'),
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  taxInclusive: integer('tax_inclusive', { mode: 'boolean' }).notNull().default(true),
  status: text('status').notNull().default('draft'),
  notes: text('notes'),
  terms: text('terms'),
  currency: text('currency').notNull().default('NZD'),
  templateName: text('template_name'),
  publicViewedAt: timestamptz('public_viewed_at'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('invoices_subtotal_check', sql`subtotal <> '' AND subtotal NOT GLOB '*[^0-9.]*' AND subtotal GLOB '[0-9]*' AND subtotal NOT LIKE '%.' AND length(subtotal) - length(replace(subtotal, '.', '')) <= 1`),
  check('invoices_tax_amount_check', sql`tax_amount <> '' AND tax_amount NOT GLOB '*[^0-9.]*' AND tax_amount GLOB '[0-9]*' AND tax_amount NOT LIKE '%.' AND length(tax_amount) - length(replace(tax_amount, '.', '')) <= 1`),
  check('invoices_total_check', sql`total <> '' AND total NOT GLOB '*[^0-9.]*' AND total GLOB '[0-9]*' AND total NOT LIKE '%.' AND length(total) - length(replace(total, '.', '')) <= 1`),
  check('invoices_total_paid_check', sql`total_paid <> '' AND total_paid NOT GLOB '*[^0-9.]*' AND total_paid GLOB '[0-9]*' AND total_paid NOT LIKE '%.' AND length(total_paid) - length(replace(total_paid, '.', '')) <= 1`),
  check('invoices_payment_status_check', sql`payment_status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled')`),
  check('invoices_status_check', sql`status IN ('draft', 'sent', 'paid', 'overdue')`),
  check('invoices_discount_type_check', sql`discount_type IN ('fixed', 'percent')`),
  check('invoices_payment_term_days_check', sql`payment_term_days >= 0 AND payment_term_days <= 365`),
  uniqueIndex('invoices_org_id_uidx').on(table.organisationId, table.id),
  index('invoices_org_idx').on(table.organisationId),
  uniqueIndex('invoices_organisationId_invoiceNumber_uidx').on(table.organisationId, table.invoiceNumber),
  foreignKey({ columns: [table.organisationId, table.customerId], foreignColumns: [customers.organisationId, customers.id] }).onDelete('restrict'),
]);

export const lineItems = sqliteTable('line_items', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  invoiceId: text('invoice_id').notNull(),
  description: text('description').notNull(),
  quantity: money('quantity').notNull(),
  unit: text('unit').notNull().default('ea'),
  rate: money('rate').notNull(),
  rateUnit: text('rate_unit').notNull().default('ea'),
  tax: money('tax'),
  total: money('total').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('line_items_quantity_check', sql`quantity <> '' AND quantity NOT GLOB '*[^0-9.]*' AND quantity GLOB '[0-9]*' AND quantity NOT LIKE '%.' AND length(quantity) - length(replace(quantity, '.', '')) <= 1 AND trim(quantity, '0.') <> ''`),
  check('line_items_rate_check', sql`rate <> '' AND rate NOT GLOB '*[^0-9.]*' AND rate GLOB '[0-9]*' AND rate NOT LIKE '%.' AND length(rate) - length(replace(rate, '.', '')) <= 1`),
  check('line_items_total_check', sql`total <> '' AND total NOT GLOB '*[^0-9.]*' AND total GLOB '[0-9]*' AND total NOT LIKE '%.' AND length(total) - length(replace(total, '.', '')) <= 1`),
  uniqueIndex('line_items_org_id_uidx').on(table.organisationId, table.id),
  index('line_items_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.invoiceId], foreignColumns: [invoices.organisationId, invoices.id] }).onDelete('cascade'),
]);
