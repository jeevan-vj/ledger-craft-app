import { organisations, users } from './identity';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamptz = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const itemCategories = sqliteTable('item_categories', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  color: text('color'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  uniqueIndex('item_categories_org_id_uidx').on(table.organisationId, table.id),
  index('item_categories_org_idx').on(table.organisationId),
]);

export const items = sqliteTable('items', {
  id: text('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull(),
  categoryId: text('category_id'),
  salePrice: text('sale_price'),
  purchasePrice: text('purchase_price'),
  taxRate: text('tax_rate'),
  enableSaleInfo: integer('enable_sale_info', { mode: 'boolean' }).notNull().default(false),
  enablePurchaseInfo: integer('enable_purchase_info', { mode: 'boolean' }).notNull().default(false),
  unit: text('unit').notNull().default('ea'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamptz('created_at').default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: timestamptz('updated_at').default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  check('items_type_check', sql`type IN ('product', 'service')`),
  uniqueIndex('items_org_id_uidx').on(table.organisationId, table.id),
  index('items_org_idx').on(table.organisationId),
  foreignKey({ columns: [table.organisationId, table.categoryId], foreignColumns: [itemCategories.organisationId, itemCategories.id] }).onDelete('restrict'),
]);
