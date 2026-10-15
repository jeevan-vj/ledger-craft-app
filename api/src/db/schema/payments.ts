import { organisations, users } from './identity';
import { invoices } from './invoices';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });
// Decimal values remain exact strings; arithmetic belongs to the server decimal helpers.
const money = (name: string) => text(name);

export const payments = sqliteTable('payments', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  invoiceId: text('invoice_id').notNull(),
  paymentMethod: text('payment_method').notNull(),
  amount: money('amount').notNull(),
  paymentDate: text('payment_date').notNull(),
  referenceNumber: text('reference_number'),
  notes: text('notes'),
  status: text('status').notNull().default('completed'),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('payments_amount_check', sql`amount <> '' AND amount NOT GLOB '*[^0-9.]*' AND amount GLOB '[0-9]*' AND amount NOT LIKE '%.' AND length(amount) - length(replace(amount, '.', '')) <= 1`),
  check('payments_status_check', sql`status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')`),
  uniqueIndex('payments_org_id_uidx').on(table.organisationId, table.id),
  index('payments_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.invoiceId], foreignColumns: [invoices.organisationId, invoices.id] }).onDelete('restrict'),
]);
