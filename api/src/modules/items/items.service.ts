import {
  itemListResponseSchema,
  type BulkItemRequest, type BulkItemResponse,
  type CreateItemCategoryRequest, type CreateItemRequest,
  type DuplicateItemRequest, type ImportItemsRequest, type ImportItemsResponse,
  type ItemCategoryDto, type ItemDto, type ItemListResponse,
  type UpdateItemCategoryRequest, type UpdateItemRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { csvCell } from '../../lib/csv';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './items.repository';

async function assertCategory(tx: Database, organisationId: string, categoryId?: string | null) {
  if (categoryId && !await repo.getCategory(tx, organisationId, categoryId)) {
    throw new HTTPException(400, { message: 'Item category not found' });
  }
}

export async function listCatalogForUser(db: Database, userId: string): Promise<ItemListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => itemListResponseSchema.parse({
    items: await repo.listItems(tx, ctx.organisationId),
    categories: await repo.listCategories(tx, ctx.organisationId),
  }));
}

export async function getItemForUser(db: Database, userId: string, id: string): Promise<ItemDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const item = await repo.getItem(tx, ctx.organisationId, id);
    if (!item) throw new HTTPException(404, { message: 'Item not found' });
    return item;
  });
}

export async function createItemForUser(db: Database, userId: string, input: CreateItemRequest): Promise<ItemDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    await assertCategory(tx, ctx.organisationId, input.categoryId);
    return repo.insertItem(tx, ctx, input);
  });
}

export async function updateItemForUser(db: Database, userId: string, id: string, input: UpdateItemRequest): Promise<ItemDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    await assertCategory(tx, ctx.organisationId, input.categoryId);
    const item = await repo.updateItem(tx, ctx.organisationId, id, input);
    if (!item) throw new HTTPException(404, { message: 'Item not found' });
    return item;
  });
}

export async function duplicateItemForUser(db: Database, userId: string, id: string, input: DuplicateItemRequest): Promise<ItemDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const source = await repo.getItem(tx, ctx.organisationId, id);
    if (!source) throw new HTTPException(404, { message: 'Item not found' });
    return repo.insertItem(tx, ctx, {
      name: input.name ?? `${source.name} (copy)`, description: source.description, type: source.type,
      categoryId: source.categoryId, salePrice: source.salePrice, purchasePrice: source.purchasePrice,
      taxRate: source.taxRate, enableSaleInfo: source.enableSaleInfo,
      enablePurchaseInfo: source.enablePurchaseInfo, unit: source.unit, isActive: source.isActive,
    });
  });
}

export async function bulkItemsForUser(db: Database, userId: string, input: BulkItemRequest): Promise<BulkItemResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await Promise.all(input.ids.map((id) => repo.getItem(tx, ctx.organisationId, id)));
    if (existing.some((item) => !item)) throw new HTTPException(404, { message: 'One or more items were not found' });
    return { affected: await repo.bulkItems(tx, ctx.organisationId, input.ids, input.action) };
  });
}

export async function deleteItemForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (!await repo.deleteItem(tx, ctx.organisationId, id)) throw new HTTPException(404, { message: 'Item not found' });
  });
}

export async function importItemsForUser(db: Database, userId: string, input: ImportItemsRequest): Promise<ImportItemsResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    for (const row of input.rows) await assertCategory(tx, ctx.organisationId, row.categoryId);
    if (input.dryRun) return { valid: true, imported: 0, errors: [] };
    for (const row of input.rows) {
      if (row.id) {
        const existing = await repo.getItem(tx, ctx.organisationId, row.id);
        if (!existing) throw new HTTPException(404, { message: `Item ${row.id} was not found` });
        await repo.updateItem(tx, ctx.organisationId, row.id, row);
      } else {
        await repo.insertItem(tx, ctx, row);
      }
    }
    return { valid: true, imported: input.rows.length, errors: [] };
  });
}

export async function exportItemsForUser(db: Database, userId: string): Promise<string> {
  const catalog = await listCatalogForUser(db, userId);
  const headers = ['id','name','description','type','categoryId','salePrice','purchasePrice','taxRate','enableSaleInfo','enablePurchaseInfo','unit','isActive'];
  return [headers.join(','), ...catalog.items.map((item) => headers.map((key) => csvCell(item[key as keyof ItemDto])).join(','))].join('\n');
}

export async function createCategoryForUser(db: Database, userId: string, input: CreateItemCategoryRequest): Promise<ItemCategoryDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => repo.insertCategory(tx, ctx, input));
}

export async function updateCategoryForUser(db: Database, userId: string, id: string, input: UpdateItemCategoryRequest): Promise<ItemCategoryDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const category = await repo.updateCategory(tx, ctx.organisationId, id, input);
    if (!category) throw new HTTPException(404, { message: 'Item category not found' });
    return category;
  });
}

export async function deleteCategoryForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (await repo.countItemsForCategory(tx, ctx.organisationId, id)) {
      throw new HTTPException(409, { message: 'Category is still used by items' });
    }
    if (!await repo.deleteCategory(tx, ctx.organisationId, id)) throw new HTTPException(404, { message: 'Item category not found' });
  });
}
