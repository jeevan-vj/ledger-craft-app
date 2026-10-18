import { describe, expect, it } from 'vitest';
import {
  bulkItemRequestSchema,
  createItemRequestSchema,
  importItemsRequestSchema,
  itemListResponseSchema,
  itemSchema,
} from './item';

describe('item contracts', () => {
  const item = {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Brand identity',
    description: null,
    type: 'service' as const,
    categoryId: null,
    salePrice: '4500.0000',
    purchasePrice: null,
    taxRate: '15.0000',
    enableSaleInfo: true,
    enablePurchaseInfo: false,
    unit: 'ea',
    isActive: true,
    category: null,
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  };

  it('accepts a camelCase item DTO', () => {
    expect(itemSchema.parse(item)).toEqual(item);
  });

  it('rejects ownership ids on create', () => {
    const result = createItemRequestSchema.safeParse({
      name: 'Brand identity',
      type: 'service',
      organisationId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a list envelope', () => {
    expect(itemListResponseSchema.parse({ items: [item], categories: [] })).toEqual({
      items: [item],
      categories: [],
    });
  });

  it('rejects blank names, negative prices, and tax rates above 100', () => {
    expect(createItemRequestSchema.safeParse({ name: '   ', type: 'product' }).success).toBe(false);
    expect(createItemRequestSchema.safeParse({ name: 'Widget', type: 'product', salePrice: '-1' }).success).toBe(false);
    expect(createItemRequestSchema.safeParse({ name: 'Widget', type: 'product', taxRate: '100.01' }).success).toBe(false);
  });

  it('accepts bounded bulk actions and import previews', () => {
    const id = '33333333-3333-3333-3333-333333333333';
    expect(bulkItemRequestSchema.parse({ action: 'deactivate', ids: [id] })).toEqual({ action: 'deactivate', ids: [id] });
    expect(importItemsRequestSchema.parse({ dryRun: true, rows: [{ name: 'Widget', type: 'product', salePrice: '12.50' }] }).dryRun).toBe(true);
  });
});
