import {
  salesTaxReclassificationListSchema,
  salesTaxReclassificationSchema,
  salesTaxReclassifyPreviewSchema,
  type SalesTaxReclassification,
  type SalesTaxReclassificationList,
  type SalesTaxReclassifyPreview,
} from '@ledgercraft/contracts';
import { z } from 'zod';
import { readApiFailure } from '@/lib/api/readApiError';

async function request<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return schema.parse(await response.json());
}

export const salesTaxReclassifyApi = {
  list: () => request('/api/tax/sales-tax-reclassifications', salesTaxReclassificationListSchema),
  preview: (lineIds: string[], taxCode: 'zero_rated' | 'exempt') => request('/api/tax/sales-tax-reclassifications/preview', salesTaxReclassifyPreviewSchema, 'POST', { lineIds, taxCode }),
  apply: (lineIds: string[], taxCode: 'zero_rated' | 'exempt', reason: string) => request('/api/tax/sales-tax-reclassifications', salesTaxReclassificationSchema, 'POST', { lineIds, taxCode, reason }),
  undo: (id: string, reason: string) => request(`/api/tax/sales-tax-reclassifications/${encodeURIComponent(id)}/undo`, salesTaxReclassificationSchema, 'POST', { reason }),
};

export type { SalesTaxReclassification, SalesTaxReclassificationList, SalesTaxReclassifyPreview };
