import {
  itemCategorySchema,
  itemSchema,
  type CreateItemCategoryRequest,
  type CreateItemRequest,
  type ItemCategoryDto,
  type ItemDto,
  type UpdateItemRequest,
} from '@ledgercraft/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { itemCategories, items } from '../../db/schema/items';

function toCategoryDto(row: typeof itemCategories.$inferSelect): ItemCategoryDto {
  return itemCategorySchema.parse({
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toItemDto(row: typeof items.$inferSelect): ItemDto {
  return itemSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    type: row.type,
    categoryId: row.categoryId ?? null,
    salePrice: row.salePrice ?? null,
    purchasePrice: row.purchasePrice ?? null,
    taxRate: row.taxRate ?? null,
    enableSaleInfo: row.enableSaleInfo,
    enablePurchaseInfo: row.enablePurchaseInfo,
    unit: row.unit,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listItems(tx: Database, organisationId: string): Promise<ItemDto[]> {
  const rows = await tx.select().from(items).where(eq(items.organisationId, organisationId)).orderBy(items.name);
  return rows.map(toItemDto);
}

export async function listCategories(
  tx: Database,
  organisationId: string,
): Promise<ItemCategoryDto[]> {
  const rows = await tx
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.organisationId, organisationId))
    .orderBy(itemCategories.name);
  return rows.map(toCategoryDto);
}

export async function insertItem(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateItemRequest,
): Promise<ItemDto> {
  const [row] = await tx
    .insert(items)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      categoryId: input.categoryId ?? null,
      salePrice: input.salePrice ?? null,
      purchasePrice: input.purchasePrice ?? null,
      taxRate: input.taxRate ?? null,
      enableSaleInfo: input.enableSaleInfo ?? true,
      enablePurchaseInfo: input.enablePurchaseInfo ?? false,
      unit: input.unit ?? 'ea',
    })
    .returning();
  if (!row) throw new Error('Failed to insert item');
  return toItemDto(row);
}

export async function updateItem(
  tx: Database,
  organisationId: string,
  id: string,
  input: UpdateItemRequest,
): Promise<ItemDto | undefined> {
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

  const [row] = await tx
    .update(items)
    .set(patch)
    .where(and(eq(items.id, id), eq(items.organisationId, organisationId)))
    .returning();
  return row ? toItemDto(row) : undefined;
}

export async function deleteItem(tx: Database, organisationId: string, id: string): Promise<boolean> {
  const deleted = await tx
    .delete(items)
    .where(and(eq(items.id, id), eq(items.organisationId, organisationId)))
    .returning({ id: items.id });
  return deleted.length > 0;
}

export async function insertCategory(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: CreateItemCategoryRequest,
): Promise<ItemCategoryDto> {
  const [row] = await tx
    .insert(itemCategories)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      name: input.name,
      color: input.color ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert item category');
  return toCategoryDto(row);
}

export async function getCategory(tx: Database, organisationId: string, id: string) {
  const [row] = await tx.select().from(itemCategories).where(and(
    eq(itemCategories.organisationId, organisationId), eq(itemCategories.id, id),
  ));
  return row;
}
