import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const customers = sqliteTable('customers', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zip: text('zip'),
  country: text('country').notNull().default('NZ'),
  phone: text('phone'),
  isVip: integer('is_vip', { mode: 'boolean' }),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('customers_org_id_uidx').on(table.organisationId, table.id),
  index('customers_org_idx').on(table.organisationId),
]);
