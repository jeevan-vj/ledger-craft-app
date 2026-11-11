import { createCustomsGstRequestSchema, customsGstEntrySchema, type CreateCustomsGstRequest, type CustomsGstEntry } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';

export const customsGstApi = {
  create(input: CreateCustomsGstRequest): Promise<CustomsGstEntry> {
    const body = createCustomsGstRequestSchema.parse(input);
    return apiRequest('/api/tax/customs-gst', { method: 'POST', headers: { 'Idempotency-Key': `customs-${Date.now()}-${Math.random().toString(36).slice(2)}` }, body: JSON.stringify(body) }).then((value) => customsGstEntrySchema.parse(value));
  },
};
