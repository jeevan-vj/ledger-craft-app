import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations, users } from './identity';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const recurringTemplates = sqliteTable('recurring_templates', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(), kind: text('kind').notNull(), status: text('status').notNull().default('active'),
  payloadJson: text('payload_json').notNull(), scheduleJson: text('schedule_json').notNull(),
  nextRunAt: timestamp('next_run_at'), lastRunAt: timestamp('last_run_at'), occurrencesCreated: integer('occurrences_created').notNull().default(0),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(), updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('recurring_templates_kind_check', sql`${table.kind} IN ('invoice','bill','income','expense')`),
  check('recurring_templates_status_check', sql`${table.status} IN ('active','paused','ended')`),
  uniqueIndex('recurring_templates_org_id_uidx').on(table.organisationId, table.id),
  index('recurring_templates_due_idx').on(table.organisationId, table.status, table.nextRunAt),
]);

export const recurringRuns = sqliteTable('recurring_runs', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  templateId: text('template_id').notNull().references(() => recurringTemplates.id, { onDelete: 'cascade' }),
  occurrenceKey: text('occurrence_key').notNull(), scheduledFor: timestamp('scheduled_for').notNull(),
  status: text('status').notNull(), attemptCount: integer('attempt_count').notNull().default(1), generatedType: text('generated_type').notNull(),
  generatedId: text('generated_id'), deliveryStatus: text('delivery_status').notNull().default('not_requested'), failureReason: text('failure_reason'), nextAttemptAt: timestamp('next_attempt_at'),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(), updatedAt: timestamp('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('recurring_runs_status_check', sql`${table.status} IN ('running','succeeded','failed')`),
  uniqueIndex('recurring_runs_occurrence_uidx').on(table.organisationId, table.occurrenceKey),
  uniqueIndex('recurring_runs_org_id_uidx').on(table.organisationId, table.id),
  index('recurring_runs_template_idx').on(table.organisationId, table.templateId, table.scheduledFor),
]);
