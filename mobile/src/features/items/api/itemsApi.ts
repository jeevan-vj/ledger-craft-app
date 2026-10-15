import { apiRequest } from '@/features/auth/api/http';

export interface MobileItemDto {
  id: string;
  name: string;
  description: string | null;
  type: 'product' | 'service';
  categoryId: string | null;
  salePrice: string | null;
  purchasePrice: string | null;
  taxRate: string | null;
  enableSaleInfo: boolean;
  enablePurchaseInfo: boolean;
  unit: string;
  createdAt: string;
  updatedAt: string;
}

export interface MobileItemCategoryDto {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export function itemsApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ITEMS_API !== 'false';
}

function money(value: number | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
}

export type CatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  type: 'product' | 'service';
  categoryId?: string | null;
  salePrice?: number | null;
  purchasePrice?: number | null;
  taxRate?: number | null;
  enableSaleInfo: boolean;
  enablePurchaseInfo: boolean;
  unit: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CatalogCategory = {
  id: string;
  name: string;
  color?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function toItem(dto: MobileItemDto): CatalogItem {
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
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toCategory(dto: MobileItemCategoryDto): CatalogCategory {
  return {
    id: dto.id,
    name: dto.name,
    color: dto.color ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export const itemsApi = {
  async list(): Promise<{ items: CatalogItem[]; categories: CatalogCategory[] }> {
    const body = await apiRequest<{ items: MobileItemDto[]; categories: MobileItemCategoryDto[] }>(
      '/api/items',
    );
    return {
      items: body.items.map(toItem),
      categories: body.categories.map(toCategory),
    };
  },

  async create(input: Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<CatalogItem> {
    return toItem(
      await apiRequest<MobileItemDto>('/api/items', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          description: input.description ?? null,
          type: input.type,
          categoryId: input.categoryId || null,
          salePrice: money(input.salePrice),
          purchasePrice: money(input.purchasePrice),
          taxRate: money(input.taxRate),
          enableSaleInfo: input.enableSaleInfo,
          enablePurchaseInfo: input.enablePurchaseInfo,
          unit: input.unit || 'unit',
        }),
      }),
    );
  },

  async update(
    id: string,
    input: Partial<Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CatalogItem> {
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.description !== undefined) body.description = input.description ?? null;
    if (input.type !== undefined) body.type = input.type;
    if (input.categoryId !== undefined) body.categoryId = input.categoryId || null;
    if (input.salePrice !== undefined) body.salePrice = money(input.salePrice);
    if (input.purchasePrice !== undefined) body.purchasePrice = money(input.purchasePrice);
    if (input.taxRate !== undefined) body.taxRate = money(input.taxRate);
    if (input.enableSaleInfo !== undefined) body.enableSaleInfo = input.enableSaleInfo;
    if (input.enablePurchaseInfo !== undefined) body.enablePurchaseInfo = input.enablePurchaseInfo;
    if (input.unit !== undefined) body.unit = input.unit;

    return toItem(
      await apiRequest<MobileItemDto>(`/api/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    );
  },

  async remove(id: string): Promise<void> {
    await apiRequest<void>(`/api/items/${id}`, { method: 'DELETE' });
  },

  async createCategory(input: Omit<CatalogCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<CatalogCategory> {
    return toCategory(
      await apiRequest<MobileItemCategoryDto>('/api/item-categories', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          color: input.color ?? null,
        }),
      }),
    );
  },
};
