import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    organisationId: text('organisation_id').notNull().references(() => organisations.id),
    userId: text('user_id').notNull().references(() => users.id),
    key: text('key').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: text('response_body', { mode: 'json' }).notNull(),
    createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  },
  (table) => [
    unique('idempotency_keys_scope').on(table.organisationId, table.userId, table.method, table.path, table.key),
  ],
);
