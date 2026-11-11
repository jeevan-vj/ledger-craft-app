import { z } from 'zod';
import { gstSettingsSchema, gstPeriodsResponseSchema, gstReturnRecalculationResponseSchema, updateGstSettingsRequestSchema, taxReturnSchema, taxReturnListResponseSchema, type UpdateGstSettingsRequest } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

async function request<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: 'include', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return schema.parse(await response.json());
}
export const gstSettingsApi = {
  settings: () => request('/api/tax/gst-settings', gstSettingsSchema),
  async save(input: UpdateGstSettingsRequest) {
    const parsed = updateGstSettingsRequestSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check the GST registration settings.');
    await request('/api/tax/gst-settings', gstSettingsSchema, 'PUT', parsed.data);
    return request('/api/tax/gst-settings', gstSettingsSchema);
  },
  periods: () => request('/api/tax/gst-periods', gstPeriodsResponseSchema),
  returns: () => request('/api/tax-returns', taxReturnListResponseSchema),
  recalculation: (id: string) => request(`/api/tax-returns/${encodeURIComponent(id)}/recalculation`, gstReturnRecalculationResponseSchema),
  getReturn: (id: string) => request(`/api/tax-returns/${encodeURIComponent(id)}`, taxReturnSchema),
  async file(id: string, irdReference: string, acknowledgeRounding?: boolean) {
    await request(`/api/tax-returns/${encodeURIComponent(id)}/file`, taxReturnSchema, 'POST', { irdReference, ...(acknowledgeRounding ? { acknowledgeRounding: true } : {}) });
    return request(`/api/tax-returns/${encodeURIComponent(id)}`, taxReturnSchema);
  },
  reopen(id: string, reason: string) {
    return request(`/api/tax-returns/${encodeURIComponent(id)}/reopen`, taxReturnSchema, 'POST', { reason });
  },
};
