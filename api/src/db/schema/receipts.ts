import { organisations, users } from './identity';
import { payments } from './payments';
import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const receipts = sqliteTable('receipts', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  paymentId: text('payment_id').notNull(),
  receiptNumber: text('receipt_number').notNull(),
  generatedAt: timestamptz('generated_at').default(sql`(unixepoch() * 1000)`).notNull(),
  emailSentAt: timestamptz('email_sent_at'),
  isEmailed: integer('is_emailed', { mode: 'boolean' }).notNull().default(false),
  receiptData: text('receipt_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('receipts_org_id_uidx').on(table.organisationId, table.id),
  index('receipts_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.paymentId], foreignColumns: [payments.organisationId, payments.id] }).onDelete('cascade'),
]);
