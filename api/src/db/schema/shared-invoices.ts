import { organisations } from './identity';
import { invoices } from './invoices';
import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const sharedInvoices = sqliteTable('shared_invoices', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  originalInvoiceId: text('original_invoice_id').notNull(),
  invoiceData: text('invoice_data', { mode: 'json' }).notNull(),
  templateData: text('template_data', { mode: 'json' }).notNull(),
  shareToken: text('share_token').notNull().unique(),
  expiresAt: timestamptz('expires_at'),
  accessCount: integer('access_count').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by').notNull(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('shared_invoices_org_id_uidx').on(table.organisationId, table.id),
  index('shared_invoices_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.originalInvoiceId], foreignColumns: [invoices.organisationId, invoices.id] }).onDelete('cascade'),
]);
