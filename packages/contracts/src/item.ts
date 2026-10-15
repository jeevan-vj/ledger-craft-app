import { z } from 'zod';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);

export const itemCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  color: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const itemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  type: z.enum(['product', 'service']),
  categoryId: z.string().uuid().nullable(),
  salePrice: money.nullable(),
  purchasePrice: money.nullable(),
  taxRate: money.nullable(),
  enableSaleInfo: z.boolean(),
  enablePurchaseInfo: z.boolean(),
  unit: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createItemRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    type: z.enum(['product', 'service']),
    categoryId: z.string().uuid().nullable().optional(),
    salePrice: money.nullable().optional(),
    purchasePrice: money.nullable().optional(),
    taxRate: money.nullable().optional(),
    enableSaleInfo: z.boolean().optional(),
    enablePurchaseInfo: z.boolean().optional(),
    unit: z.string().min(1).optional(),
  })
  .strict();

export const updateItemRequestSchema = createItemRequestSchema.partial();

export const createItemCategoryRequestSchema = z
  .object({
    name: z.string().min(1),
    color: z.string().nullable().optional(),
  })
  .strict();

export const itemListResponseSchema = z.object({
  items: z.array(itemSchema),
  categories: z.array(itemCategorySchema),
});

export type ItemDto = z.infer<typeof itemSchema>;
export type ItemCategoryDto = z.infer<typeof itemCategorySchema>;
export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;
export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;
export type CreateItemCategoryRequest = z.infer<typeof createItemCategoryRequestSchema>;
export type ItemListResponse = z.infer<typeof itemListResponseSchema>;
