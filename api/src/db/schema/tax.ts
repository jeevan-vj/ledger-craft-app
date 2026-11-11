import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });
// Decimal values remain exact strings; arithmetic belongs to the server decimal helpers.
const money = (name: string) => text(name);

export const taxConfigurations = sqliteTable('tax_configurations', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  countryCode: text('country_code').notNull().default('NZ'),
  taxType: text('tax_type').notNull(),
  taxRate: money('tax_rate').notNull(),
  taxName: text('tax_name').notNull(),
  appliesToServices: integer('applies_to_services', { mode: 'boolean' }).notNull().default(true),
  appliesToGoods: integer('applies_to_goods', { mode: 'boolean' }).notNull().default(true),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('tax_configurations_tax_type_check', sql`tax_type IN ('GST', 'VAT', 'Sales_Tax')`),
  uniqueIndex('tax_configurations_org_id_uidx').on(table.organisationId, table.id),
  index('tax_configurations_org_idx').on(table.organisationId),
]);

export const taxReturns = sqliteTable('tax_returns', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  returnType: text('return_type').notNull(),
  totalSales: money('total_sales').notNull().default('0'),
  totalPurchases: money('total_purchases').notNull().default('0'),
  gstOnSales: money('gst_on_sales').notNull().default('0'),
  gstOnPurchases: money('gst_on_purchases').notNull().default('0'),
  netGst: money('net_gst').notNull().default('0'),
  status: text('status').notNull().default('draft'),
  submittedAt: timestamptz('submitted_at'),
  irdReference: text('ird_reference'),
  returnData: text('return_data', { mode: 'json' }),
  supersededAt: timestamptz('superseded_at'),
  reopenReason: text('reopen_reason'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('tax_returns_return_type_check', sql`return_type IN ('GST', 'Income_Tax', 'PAYE')`),
  check('tax_returns_status_check', sql`status IN ('draft', 'submitted', 'approved', 'rejected')`),
  uniqueIndex('tax_returns_org_id_uidx').on(table.organisationId, table.id),
  index('tax_returns_org_idx').on(table.organisationId),
]);

export const taxAdjustments = sqliteTable('tax_adjustments', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  taxReturnId: text('tax_return_id'),
  adjustmentType: text('adjustment_type').notNull(),
  description: text('description').notNull(),
  amount: money('amount').notNull(),
  taxImpact: money('tax_impact').notNull().default('0'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('tax_adjustments_type_check', sql`adjustment_type IN ('bad_debt', 'capital_goods', 'correction', 'other')`),
  uniqueIndex('tax_adjustments_org_id_uidx').on(table.organisationId, table.id),
  index('tax_adjustments_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.taxReturnId], foreignColumns: [taxReturns.organisationId, taxReturns.id] }).onDelete('restrict'),
]);

export const salesTaxReclassifications = sqliteTable('sales_tax_reclassifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  actorId: text('actor_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  taxCode: text('tax_code'),
  reason: text('reason').notNull(),
  lineIds: text('line_ids', { mode: 'json' }).$type<string[]>().notNull(),
  previousCodes: text('previous_codes', { mode: 'json' }).$type<Record<string, string | null>>().notNull(),
  beforeImpact: text('before_impact', { mode: 'json' }).notNull(),
  afterImpact: text('after_impact', { mode: 'json' }).notNull(),
  periodImpacts: text('period_impacts', { mode: 'json' }).notNull(),
  undoneAt: timestamptz('undone_at'),
  undoOfId: text('undo_of_id'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('sales_tax_reclassifications_org_id_uidx').on(table.organisationId, table.id),
  index('sales_tax_reclassifications_org_idx').on(table.organisationId),
  check('sales_tax_reclassifications_action_check', sql`${table.action} IN ('apply', 'undo')`),
  check('sales_tax_reclassifications_code_check', sql`${table.taxCode} IS NULL OR ${table.taxCode} IN ('zero_rated', 'exempt')`),
]);

export const gstReturnAuditEvents = sqliteTable('gst_return_audit_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  taxReturnId: text('tax_return_id').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('gst_return_audit_events_org_id_uidx').on(table.organisationId, table.id),
  index('gst_return_audit_events_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.taxReturnId], foreignColumns: [taxReturns.organisationId, taxReturns.id] }).onDelete('restrict'),
  check('gst_return_audit_events_action_check', sql`${table.action} IN ('reopen')`),
]);
