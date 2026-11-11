import { gstPeriodsResponseSchema, gstSettingsSchema, updateGstSettingsRequestSchema, taxReturnSchema, fileTaxReturnRequestSchema, type UpdateGstSettingsRequest } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
export const gstWorkspaceApi = {
  async periods() { return gstPeriodsResponseSchema.parse(await apiRequest('/api/tax/gst-periods', { method: 'GET' })); },
  async saveSettings(input: UpdateGstSettingsRequest) {
    const checked = updateGstSettingsRequestSchema.safeParse(input);
    if (!checked.success) throw new Error(checked.error.issues[0]?.message ?? 'Review the GST settings.');
    return gstSettingsSchema.parse(await apiRequest('/api/tax/gst-settings', { method: 'PUT', body: JSON.stringify(checked.data) }));
  },
  async getReturn(id: string) { return taxReturnSchema.parse(await apiRequest(`/api/tax-returns/${id}`, { method: 'GET' })); },
  async fileReturn(id: string, reference: string) { const body = fileTaxReturnRequestSchema.parse({ irdReference: reference }); return taxReturnSchema.parse(await apiRequest(`/api/tax-returns/${id}/file`, { method: 'POST', body: JSON.stringify(body) })); },
  async reopen(id: string, reason: string) { return taxReturnSchema.parse(await apiRequest(`/api/tax-returns/${id}/reopen`, { method: 'POST', body: JSON.stringify({ reason }) })); },
};
