import type { BulkItemRequest, CreateItemCategoryRequest, CreateItemRequest, ImportItemsRequest, ImportItemsResponse, ItemCategoryDto, ItemDto, UpdateItemCategoryRequest, UpdateItemRequest } from '@ledgercraft/contracts';
import type { Item, ItemCategory } from '@/types';

export function itemsApiEnabled(): boolean {
  return import.meta.env.VITE_ITEMS_API !== 'false';
}

export class ItemsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ItemsApiError';
  }
}

function money(value: number | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
}

function toItem(dto: ItemDto): Item {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    type: dto.type,
    categoryId: dto.categoryId,
    salePrice: dto.salePrice == null ? null : Number(dto.salePrice),
    purchasePrice: dto.purchasePrice == null ? null : Number(dto.purchasePrice),
    taxRate: dto.taxRate == null ? null : Number(dto.taxRate),
    enableSaleInfo: dto.enableSaleInfo,
    enablePurchaseInfo: dto.enablePurchaseInfo,
    unit: dto.unit,
    isActive: dto.isActive,
    category: dto.category ? toCategory(dto.category) : null,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function toCategory(dto: ItemCategoryDto): ItemCategory {
  return {
    id: dto.id,
    name: dto.name,
    color: dto.color ?? undefined,
    isActive: dto.isActive,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toCreateItemRequest(
  item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'category'>,
): CreateItemRequest {
  return {
    name: item.name,
    description: item.description ?? null,
    type: item.type,
    categoryId: item.categoryId ?? null,
    salePrice: money(item.salePrice),
    purchasePrice: money(item.purchasePrice),
    taxRate: money(item.taxRate),
    enableSaleInfo: item.enableSaleInfo,
    enablePurchaseInfo: item.enablePurchaseInfo,
    unit: item.unit || 'ea',
    isActive: item.isActive,
  };
}

export function toUpdateItemRequest(
  item: Partial<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'category'>>,
): UpdateItemRequest {
  const input: UpdateItemRequest = {};
  if (item.name !== undefined) input.name = item.name;
  if (item.description !== undefined) input.description = item.description ?? null;
  if (item.type !== undefined) input.type = item.type;
  if (item.categoryId !== undefined) input.categoryId = item.categoryId ?? null;
  if (item.salePrice !== undefined) input.salePrice = money(item.salePrice);
  if (item.purchasePrice !== undefined) input.purchasePrice = money(item.purchasePrice);
  if (item.taxRate !== undefined) input.taxRate = money(item.taxRate);
  if (item.enableSaleInfo !== undefined) input.enableSaleInfo = item.enableSaleInfo;
  if (item.enablePurchaseInfo !== undefined) input.enablePurchaseInfo = item.enablePurchaseInfo;
  if (item.unit !== undefined) input.unit = item.unit;
  if (item.isActive !== undefined) input.isActive = item.isActive;
  return input;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    throw new ItemsApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}

export const itemsApi = {
  async list(): Promise<{ items: Item[]; categories: ItemCategory[] }> {
    const body = await request<{ items: ItemDto[]; categories: ItemCategoryDto[] }>('/api/items');
    return {
      items: body.items.map(toItem),
      categories: body.categories.map(toCategory),
    };
  },

  async create(input: CreateItemRequest): Promise<Item> {
    return toItem(await request<ItemDto>('/api/items', { method: 'POST', body: JSON.stringify(input) }));
  },

  async update(id: string, input: UpdateItemRequest): Promise<Item> {
    return toItem(
      await request<ItemDto>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    );
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/api/items/${id}`, { method: 'DELETE' });
  },

  async duplicate(id: string): Promise<Item> {
    return toItem(await request<ItemDto>(`/api/items/${id}/duplicate`, { method: 'POST', body: '{}' }));
  },

  async bulk(input: BulkItemRequest): Promise<{ affected: number }> {
    return request('/api/items/bulk', { method: 'POST', body: JSON.stringify(input) });
  },

  async importItems(input: ImportItemsRequest): Promise<ImportItemsResponse> {
    return request('/api/items/import', { method: 'POST', body: JSON.stringify(input) });
  },

  async exportCsv(): Promise<Blob> {
    const response = await fetch('/api/items/export', { credentials: 'include' });
    if (!response.ok) throw new ItemsApiError(await parseError(response), response.status);
    return response.blob();
  },

  async createCategory(input: CreateItemCategoryRequest): Promise<ItemCategory> {
    return toCategory(
      await request<ItemCategoryDto>('/api/item-categories', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async updateCategory(id: string, input: UpdateItemCategoryRequest): Promise<ItemCategory> {
    return toCategory(await request<ItemCategoryDto>(`/api/item-categories/${id}`, {
      method: 'PATCH', body: JSON.stringify(input),
    }));
  },

  async removeCategory(id: string): Promise<void> {
    await request<void>(`/api/item-categories/${id}`, { method: 'DELETE' });
  },
};
