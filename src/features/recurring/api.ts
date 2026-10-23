import { createRecurringTemplateRequestSchema, recurringRunListResponseSchema, recurringTemplateListResponseSchema, recurringTemplateSchema, type CreateRecurringTemplateRequest } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';
async function request(path: string, init?: RequestInit) { const response = await fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } }); if (!response.ok) { const failure = await readApiFailure(response); throw new Error(failure.message); } return response.json(); }
export const recurringApi = {
  list: async () => recurringTemplateListResponseSchema.parse(await request('/api/recurring-templates')),
  runs: async (templateId?: string) => recurringRunListResponseSchema.parse(await request(`/api/recurring-runs${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ''}`)),
  create: async (input: CreateRecurringTemplateRequest) => recurringTemplateSchema.parse(await request('/api/recurring-templates', { method: 'POST', body: JSON.stringify(createRecurringTemplateRequestSchema.parse(input)) })),
  action: async (id: string, action: 'pause' | 'resume' | 'end') => recurringTemplateSchema.parse(await request(`/api/recurring-templates/${id}/${action}`, { method: 'POST' })),
  process: async () => request('/api/recurring-runs/process', { method: 'POST', body: '{}' }),
};
