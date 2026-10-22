import { customers } from './customers';
import { organisations, users } from './identity';
import { invoices } from './invoices';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });
// Decimal values remain exact strings; arithmetic belongs to the server decimal helpers.
const money = (name: string) => text(name);

const moneyCheck = (column: string) =>
  sql.raw(`${column} <> '' AND ${column} NOT GLOB '*[^0-9.]*' AND ${column} GLOB '[0-9]*' AND ${column} NOT LIKE '%.' AND length(${column}) - length(replace(${column}, '.', '')) <= 1`);

export const quotes = sqliteTable('quotes', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  quoteNumber: text('quote_number').notNull(),
  kind: text('kind', { enum: ['quote', 'estimate'] }).notNull().default('quote'),
  revision: integer('revision').notNull().default(1),
  customerId: text('customer_id').notNull(),
  date: text('date').notNull(),
  expiryDate: text('expiry_date').notNull(),
  subtotal: money('subtotal').notNull(),
  taxAmount: money('tax_amount').notNull(),
  taxRate: money('tax_rate').notNull(),
  taxInclusive: integer('tax_inclusive', { mode: 'boolean' }).notNull().default(true),
  discountType: text('discount_type').notNull().default('fixed'),
  discountPercent: money('discount_percent'),
  discount: money('discount'),
  additionalCharges: money('additional_charges'),
  additionalChargesList: text('additional_charges_list', { mode: 'json' }),
  additionalChargesTotal: money('additional_charges_total'),
  total: money('total').notNull(),
  notes: text('notes'),
  terms: text('terms'),
  currency: text('currency').notNull().default('NZD'),
  templateName: text('template_name'),
  status: text('status').notNull().default('draft'),
  sentAt: timestamptz('sent_at'),
  publicViewedAt: timestamptz('public_viewed_at'),
  respondedAt: timestamptz('responded_at'),
  respondedByName: text('responded_by_name'),
  responseNote: text('response_note'),
  acceptedRevision: integer('accepted_revision'),
  convertedInvoiceId: text('converted_invoice_id'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('quotes_kind_check', sql`kind IN ('quote', 'estimate')`),
  check('quotes_status_check', sql`status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted')`),
  check('quotes_discount_type_check', sql`discount_type IN ('fixed', 'percent')`),
  check('quotes_revision_check', sql`revision >= 1`),
  check('quotes_expiry_check', sql`expiry_date >= date`),
  check('quotes_converted_check', sql`status <> 'converted' OR converted_invoice_id IS NOT NULL`),
  check('quotes_responded_by_name_check', sql`responded_by_name IS NULL OR (length(responded_by_name) >= 1 AND length(responded_by_name) <= 120)`),
  check('quotes_response_note_check', sql`response_note IS NULL OR length(response_note) <= 1000`),
  check('quotes_subtotal_check', moneyCheck('subtotal')),
  check('quotes_tax_amount_check', moneyCheck('tax_amount')),
  check('quotes_tax_rate_check', moneyCheck('tax_rate')),
  check('quotes_total_check', moneyCheck('total')),
  uniqueIndex('quotes_org_id_uidx').on(table.organisationId, table.id),
  index('quotes_org_idx').on(table.organisationId),
  uniqueIndex('quotes_org_number_uidx').on(table.organisationId, table.quoteNumber),
  uniqueIndex('quotes_converted_invoice_uidx').on(table.organisationId, table.convertedInvoiceId),
  foreignKey({ columns: [table.organisationId, table.customerId], foreignColumns: [customers.organisationId, customers.id] }).onDelete('restrict'),
  foreignKey({ columns: [table.organisationId, table.convertedInvoiceId], foreignColumns: [invoices.organisationId, invoices.id] }).onDelete('restrict'),
]);

export const quoteLineItems = sqliteTable('quote_line_items', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  quoteId: text('quote_id').notNull(),
  description: text('description').notNull(),
  quantity: money('quantity').notNull(),
  unit: text('unit').notNull().default('ea'),
  rate: money('rate').notNull(),
  rateUnit: text('rate_unit').notNull().default('ea'),
  tax: money('tax'),
  total: money('total').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('quote_line_items_quantity_check', sql`quantity <> '' AND quantity NOT GLOB '*[^0-9.]*' AND quantity GLOB '[0-9]*' AND quantity NOT LIKE '%.' AND length(quantity) - length(replace(quantity, '.', '')) <= 1 AND trim(quantity, '0.') <> ''`),
  check('quote_line_items_rate_check', sql`rate <> '' AND rate NOT GLOB '*[^0-9.]*' AND rate GLOB '[0-9]*' AND rate NOT LIKE '%.' AND length(rate) - length(replace(rate, '.', '')) <= 1`),
  check('quote_line_items_total_check', sql`total <> '' AND total NOT GLOB '*[^0-9.]*' AND total GLOB '[0-9]*' AND total NOT LIKE '%.' AND length(total) - length(replace(total, '.', '')) <= 1`),
  uniqueIndex('quote_line_items_org_id_uidx').on(table.organisationId, table.id),
  index('quote_line_items_org_idx').on(table.organisationId),
  index('quote_line_items_org_quote_idx').on(table.organisationId, table.quoteId),
  foreignKey({ columns: [table.organisationId, table.quoteId], foreignColumns: [quotes.organisationId, quotes.id] }).onDelete('cascade'),
]);

export const sharedQuotes = sqliteTable('shared_quotes', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  quoteId: text('quote_id').notNull(),
  quoteData: text('quote_data', { mode: 'json' }).notNull(),
  templateData: text('template_data', { mode: 'json' }).notNull(),
  shareToken: text('share_token').notNull().unique(),
  revision: integer('revision').notNull().default(1),
  expiresAt: timestamptz('expires_at'),
  accessCount: integer('access_count').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('shared_quotes_org_id_uidx').on(table.organisationId, table.id),
  index('shared_quotes_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.quoteId], foreignColumns: [quotes.organisationId, quotes.id] }).onDelete('cascade'),
]);
