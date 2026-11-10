import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations, users } from './identity';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** Usage and audit rows. No prompt, customer, or note text is stored here. */
export const assistantEvents = sqliteTable('assistant_events', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  actorUserId: text('actor_user_id').notNull().references(() => users.id),
  requestId: text('request_id').notNull(),
  action: text('action').notNull(),
  outcome: text('outcome').notNull(),
  toolNames: text('tool_names').notNull().default('[]'),
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
  draftId: text('draft_id'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: text('cost_usd').notNull().default('0.000000'),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('assistant_events_action_check', sql`action IN ('turn', 'save_draft')`),
  check('assistant_events_outcome_check', sql`outcome IN ('reply', 'proposal', 'refused', 'limit', 'timeout', 'invalid_output', 'saved', 'incomplete')`),
  check('assistant_events_confirmed_check', sql`confirmed IN (0, 1)`),
  uniqueIndex('assistant_events_org_id_uidx').on(table.organisationId, table.id),
  index('assistant_events_org_created_idx').on(table.organisationId, table.createdAt),
]);
