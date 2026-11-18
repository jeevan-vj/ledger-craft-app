import {
  createGstCorrectionRequestSchema,
  gstPeriodCorrectionListSchema,
  gstPeriodCorrectionSchema,
  resolveGstCorrectionRequestSchema,
  type CreateGstCorrectionRequest,
  type GstPeriodCorrection,
  type ResolveGstCorrectionRequest,
} from '@ledgercraft/contracts';
import { z } from 'zod';
import { readApiFailure } from '@/lib/api/readApiError';

async function request<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, { method, credentials: 'include', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return schema.parse(await response.json());
}

export const gstCorrectionApi = {
  list: (from: string, to: string) => request(`/api/tax/gst-corrections?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, gstPeriodCorrectionListSchema),
  async create(input: CreateGstCorrectionRequest): Promise<GstPeriodCorrection> {
    const parsed = createGstCorrectionRequestSchema.parse(input);
    return request('/api/tax/gst-corrections', gstPeriodCorrectionSchema, 'POST', parsed);
  },
  async resolve(id: string, input: ResolveGstCorrectionRequest): Promise<GstPeriodCorrection> {
    const parsed = resolveGstCorrectionRequestSchema.parse(input);
    return request(`/api/tax/gst-corrections/${encodeURIComponent(id)}/resolve`, gstPeriodCorrectionSchema, 'POST', parsed);
  },
};
