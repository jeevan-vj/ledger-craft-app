import { z } from 'zod';

const money = z.string().regex(/^\d+(\.\d+)?$/);
const percentage = money.refine((value) => Number(value) <= 100, 'Must be between 0 and 100');
const name = z.string().trim().min(1);

export const itemCategorySchema = z.object({
  id: z.string().uuid(),
  name,
  color: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const itemSchema = z.object({
  id: z.string().uuid(),
  name,
  description: z.string().nullable(),
  type: z.enum(['product', 'service']),
  categoryId: z.string().uuid().nullable(),
  salePrice: money.nullable(),
  purchasePrice: money.nullable(),
  taxRate: percentage.nullable(),
  enableSaleInfo: z.boolean(),
  enablePurchaseInfo: z.boolean(),
  unit: z.string().min(1),
  isActive: z.boolean(),
  category: itemCategorySchema.nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createItemRequestSchema = z
  .object({
    name,
    description: z.string().nullable().optional(),
    type: z.enum(['product', 'service']),
    categoryId: z.string().uuid().nullable().optional(),
    salePrice: money.nullable().optional(),
    purchasePrice: money.nullable().optional(),
    taxRate: percentage.nullable().optional(),
    enableSaleInfo: z.boolean().optional(),
    enablePurchaseInfo: z.boolean().optional(),
    unit: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateItemRequestSchema = createItemRequestSchema.partial();

export const createItemCategoryRequestSchema = z
  .object({
    name,
    color: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const itemListResponseSchema = z.object({
  items: z.array(itemSchema),
  categories: z.array(itemCategorySchema),
});

export const updateItemCategoryRequestSchema = createItemCategoryRequestSchema.partial();

export const duplicateItemRequestSchema = z.object({ name: name.optional() }).strict();

export const bulkItemRequestSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'delete']),
  ids: z.array(z.string().uuid()).min(1).max(100),
}).strict();

export const bulkItemResponseSchema = z.object({ affected: z.number().int().nonnegative() });

export const importItemRowSchema = z.object({
  id: z.string().uuid().optional(),
  name,
  description: z.string().nullable().optional(),
  type: z.enum(['product', 'service']),
  categoryId: z.string().uuid().nullable().optional(),
  salePrice: money.nullable().optional(),
  purchasePrice: money.nullable().optional(),
  taxRate: percentage.nullable().optional(),
  enableSaleInfo: z.boolean().optional(),
  enablePurchaseInfo: z.boolean().optional(),
  unit: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const importItemsRequestSchema = z.object({
  dryRun: z.boolean().default(true),
  rows: z.array(importItemRowSchema).min(1).max(500),
}).strict();

export const importItemsResponseSchema = z.object({
  valid: z.boolean(),
  imported: z.number().int().nonnegative(),
  errors: z.array(z.object({ row: z.number().int().positive(), message: z.string() })),
});

export type ItemDto = z.infer<typeof itemSchema>;
export type ItemCategoryDto = z.infer<typeof itemCategorySchema>;
export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;
export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;
export type CreateItemCategoryRequest = z.infer<typeof createItemCategoryRequestSchema>;
export type UpdateItemCategoryRequest = z.infer<typeof updateItemCategoryRequestSchema>;
export type DuplicateItemRequest = z.infer<typeof duplicateItemRequestSchema>;
export type BulkItemRequest = z.infer<typeof bulkItemRequestSchema>;
export type BulkItemResponse = z.infer<typeof bulkItemResponseSchema>;
export type ImportItemRow = z.infer<typeof importItemRowSchema>;
export type ImportItemsRequest = z.infer<typeof importItemsRequestSchema>;
export type ImportItemsResponse = z.infer<typeof importItemsResponseSchema>;
export type ItemListResponse = z.infer<typeof itemListResponseSchema>;
