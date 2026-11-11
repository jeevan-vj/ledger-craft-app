import { createCustomsGstRequestSchema, customsGstEntrySchema, type CreateCustomsGstRequest, type CustomsGstEntry } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export async function createCustomsGst(input: CreateCustomsGstRequest): Promise<CustomsGstEntry> {
  const body = createCustomsGstRequestSchema.parse(input);
  const response = await fetch('/api/tax/customs-gst', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return customsGstEntrySchema.parse(await response.json());
}
