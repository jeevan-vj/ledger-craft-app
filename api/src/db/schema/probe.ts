import { organisations } from './identity';
import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const rlsProbe = sqliteTable('rls_probe', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  label: text('label').notNull(),
}, (table) => [
  uniqueIndex('rls_probe_org_id_uidx').on(table.organisationId, table.id),
  index('rls_probe_org_idx').on(table.organisationId),
]);
