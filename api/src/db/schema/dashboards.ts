import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations, users } from './identity';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const dashboardLayouts = sqliteTable('dashboard_layouts', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  filters: text('filters', { mode: 'json' }).notNull(),
  widgets: text('widgets', { mode: 'json' }).notNull(),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('dashboard_layouts_org_user_name_uidx').on(table.organisationId, table.userId, table.name),
  index('dashboard_layouts_org_user_idx').on(table.organisationId, table.userId),
  check('dashboard_layouts_name_check', sql`length(trim(${table.name})) BETWEEN 1 AND 80`),
]);

export const savedReportDefinitions = sqliteTable('saved_report_definitions', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  reportType: text('report_type').notNull(),
  filters: text('filters', { mode: 'json' }).notNull(),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  index('saved_report_definitions_org_user_idx').on(table.organisationId, table.userId),
  check('saved_report_definitions_type_check', sql`${table.reportType} IN ('summary', 'receivables', 'payables', 'cash', 'tax', 'activity')`),
  check('saved_report_definitions_name_check', sql`length(trim(${table.name})) BETWEEN 1 AND 100`),
]);
