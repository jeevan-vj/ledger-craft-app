import {
  itemListResponseSchema,
  type CreateItemCategoryRequest,
  type CreateItemRequest,
  type ItemCategoryDto,
  type ItemDto,
  type ItemListResponse,
  type UpdateItemRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './items.repository';

export async function listCatalogForUser(db: Database, userId: string): Promise<ItemListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const [items, categories] = await Promise.all([
      repo.listItems(tx, ctx.organisationId),
      repo.listCategories(tx, ctx.organisationId),
    ]);
    return itemListResponseSchema.parse({ items, categories });
  });
}

export async function createItemForUser(
  db: Database,
  userId: string,
  input: CreateItemRequest,
): Promise<ItemDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (input.categoryId && !await repo.getCategory(tx, ctx.organisationId, input.categoryId)) {
      throw new HTTPException(400, { message: 'Item category not found' });
    }
    return repo.insertItem(tx, ctx, input);
  });
}

export async function updateItemForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateItemRequest,
): Promise<ItemDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (input.categoryId && !await repo.getCategory(tx, ctx.organisationId, input.categoryId)) {
      throw new HTTPException(400, { message: 'Item category not found' });
    }
    const item = await repo.updateItem(tx, ctx.organisationId, id, input);
    if (!item) throw new HTTPException(404, { message: 'Item not found' });
    return item;
  });
}

export async function deleteItemForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const deleted = await repo.deleteItem(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Item not found' });
  });
}

export async function createCategoryForUser(
  db: Database,
  userId: string,
  input: CreateItemCategoryRequest,
): Promise<ItemCategoryDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => repo.insertCategory(tx, ctx, input));
}
