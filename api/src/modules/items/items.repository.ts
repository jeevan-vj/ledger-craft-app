import {
  itemCategorySchema, itemSchema,
  type CreateItemCategoryRequest, type CreateItemRequest,
  type ItemCategoryDto, type ItemDto,
  type UpdateItemCategoryRequest, type UpdateItemRequest,
} from '@ledgercraft/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { itemCategories, items } from '../../db/schema/items';

function toCategoryDto(row: typeof itemCategories.$inferSelect): ItemCategoryDto {
  return itemCategorySchema.parse({ id: row.id, name: row.name, color: row.color ?? null,
    isActive: row.isActive, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
}

function toItemDto(row: typeof items.$inferSelect, category: typeof itemCategories.$inferSelect | null): ItemDto {
  return itemSchema.parse({ id: row.id, name: row.name, description: row.description ?? null,
    type: row.type, categoryId: row.categoryId ?? null, salePrice: row.salePrice ?? null,
    purchasePrice: row.purchasePrice ?? null, taxRate: row.taxRate ?? null,
    enableSaleInfo: row.enableSaleInfo, enablePurchaseInfo: row.enablePurchaseInfo,
    unit: row.unit, isActive: row.isActive, category: category ? toCategoryDto(category) : null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
}

const itemSelection = { item: items, category: itemCategories };

export async function getItem(tx: Database, organisationId: string, id: string): Promise<ItemDto | undefined> {
  const [result] = await tx.select(itemSelection).from(items).leftJoin(itemCategories, and(
    eq(items.organisationId, itemCategories.organisationId), eq(items.categoryId, itemCategories.id),
  )).where(and(eq(items.organisationId, organisationId), eq(items.id, id)));
  return result ? toItemDto(result.item, result.category) : undefined;
}

export async function listItems(tx: Database, organisationId: string): Promise<ItemDto[]> {
  const rows = await tx.select(itemSelection).from(items).leftJoin(itemCategories, and(
    eq(items.organisationId, itemCategories.organisationId), eq(items.categoryId, itemCategories.id),
  )).where(eq(items.organisationId, organisationId)).orderBy(items.name);
  return rows.map(({ item, category }) => toItemDto(item, category));
}

export async function listCategories(tx: Database, organisationId: string): Promise<ItemCategoryDto[]> {
  return (await tx.select().from(itemCategories).where(eq(itemCategories.organisationId, organisationId))
    .orderBy(itemCategories.name)).map(toCategoryDto);
}

export async function insertItem(tx: Database, ctx: { organisationId: string; userId: string }, input: CreateItemRequest): Promise<ItemDto> {
  const [row] = await tx.insert(items).values({ organisationId: ctx.organisationId, userId: ctx.userId,
    name: input.name, description: input.description ?? null, type: input.type,
    categoryId: input.categoryId ?? null, salePrice: input.salePrice ?? null,
    purchasePrice: input.purchasePrice ?? null, taxRate: input.taxRate ?? null,
    enableSaleInfo: input.enableSaleInfo ?? true, enablePurchaseInfo: input.enablePurchaseInfo ?? false,
    unit: input.unit ?? 'ea', isActive: input.isActive ?? true }).returning({ id: items.id });
  if (!row) throw new Error('Failed to insert item');
  const created = await getItem(tx, ctx.organisationId, row.id);
  if (!created) throw new Error('Failed to load inserted item');
  return created;
}

export async function updateItem(tx: Database, organisationId: string, id: string, input: UpdateItemRequest): Promise<ItemDto | undefined> {
  const patch: Partial<typeof items.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.type !== undefined) patch.type = input.type;
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.salePrice !== undefined) patch.salePrice = input.salePrice;
  if (input.purchasePrice !== undefined) patch.purchasePrice = input.purchasePrice;
  if (input.taxRate !== undefined) patch.taxRate = input.taxRate;
  if (input.enableSaleInfo !== undefined) patch.enableSaleInfo = input.enableSaleInfo;
  if (input.enablePurchaseInfo !== undefined) patch.enablePurchaseInfo = input.enablePurchaseInfo;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  const changed = await tx.update(items).set(patch).where(and(eq(items.id, id), eq(items.organisationId, organisationId))).returning({ id: items.id });
  return changed.length ? getItem(tx, organisationId, id) : undefined;
}

export async function deleteItem(tx: Database, organisationId: string, id: string): Promise<boolean> {
  return (await tx.delete(items).where(and(eq(items.id, id), eq(items.organisationId, organisationId))).returning({ id: items.id })).length > 0;
}

export async function bulkItems(tx: Database, organisationId: string, ids: string[], action: 'activate' | 'deactivate' | 'delete'): Promise<number> {
  if (action === 'delete') return (await tx.delete(items).where(and(eq(items.organisationId, organisationId), inArray(items.id, ids))).returning({ id: items.id })).length;
  return (await tx.update(items).set({ isActive: action === 'activate', updatedAt: new Date() }).where(and(
    eq(items.organisationId, organisationId), inArray(items.id, ids),
  )).returning({ id: items.id })).length;
}

export async function insertCategory(tx: Database, ctx: { organisationId: string; userId: string }, input: CreateItemCategoryRequest): Promise<ItemCategoryDto> {
  const [row] = await tx.insert(itemCategories).values({ organisationId: ctx.organisationId, userId: ctx.userId,
    name: input.name, color: input.color ?? null, isActive: input.isActive ?? true }).returning();
  if (!row) throw new Error('Failed to insert item category');
  return toCategoryDto(row);
}

export async function getCategory(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.select().from(itemCategories).where(and(eq(itemCategories.organisationId, organisationId), eq(itemCategories.id, id)));
  return row;
}

export async function updateCategory(tx: Database, organisationId: string, id: string, input: UpdateItemCategoryRequest): Promise<ItemCategoryDto | undefined> {
  const patch: Partial<typeof itemCategories.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  const [row] = await tx.update(itemCategories).set(patch).where(and(eq(itemCategories.organisationId, organisationId), eq(itemCategories.id, id))).returning();
  return row ? toCategoryDto(row) : undefined;
}

export async function countItemsForCategory(tx: Database, organisationId: string, categoryId: string): Promise<number> {
  return (await tx.select({ id: items.id }).from(items).where(and(eq(items.organisationId, organisationId), eq(items.categoryId, categoryId)))).length;
}

export async function deleteCategory(tx: Database, organisationId: string, id: string): Promise<boolean> {
  return (await tx.delete(itemCategories).where(and(eq(itemCategories.organisationId, organisationId), eq(itemCategories.id, id))).returning({ id: itemCategories.id })).length > 0;
}
