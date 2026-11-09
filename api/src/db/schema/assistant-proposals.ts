import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organisations } from './identity';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** Server-owned invoice proposals. The conversation API cannot write this table. */
export const assistantProposals = sqliteTable('assistant_proposals', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  conversationId: text('conversation_id').notNull(),
  payload: text('payload').notNull(),
  signature: text('signature').notNull(),
  savedInvoiceId: text('saved_invoice_id'),
  createdAt: timestamp('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('assistant_proposals_org_id_uidx').on(table.organisationId, table.id),
  index('assistant_proposals_org_idx').on(table.organisationId),
]);
