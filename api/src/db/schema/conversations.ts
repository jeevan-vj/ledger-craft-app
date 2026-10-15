import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const conversations = sqliteTable('conversations', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title'),
  context: text('context', { mode: 'json' }).$type<Record<string, unknown>>(),
  status: text('status').notNull().default('active'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('conversations_status_check', sql`status IN ('active', 'completed', 'paused')`),
  uniqueIndex('conversations_org_id_uidx').on(table.organisationId, table.id),
  index('conversations_org_idx').on(table.organisationId),
]);

export const conversationMessages = sqliteTable('conversation_messages', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('conversation_messages_role_check', sql`role IN ('user', 'assistant', 'system')`),
  uniqueIndex('conversation_messages_org_id_uidx').on(table.organisationId, table.id),
  index('conversation_messages_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.conversationId], foreignColumns: [conversations.organisationId, conversations.id] }).onDelete('cascade'),
]);
