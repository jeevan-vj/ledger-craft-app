import type { CreateRecurringTemplateRequest, RecurringPreviewRequest, RecurringPreviewResponse, RecurringRunDto, RecurringTemplateDto, UpdateRecurringTemplateRequest } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
export type RecurringTemplate = RecurringTemplateDto;
export type RecurringRun = RecurringRunDto;
export const recurringService = {
  list: () => apiRequest<{ templates: RecurringTemplate[] }>('/api/recurring-templates'),
  runs: () => apiRequest<{ runs: RecurringRun[] }>('/api/recurring-runs'),
  create: (input: CreateRecurringTemplateRequest, key: string) => apiRequest<RecurringTemplate>('/api/recurring-templates', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
  update: (id: string, input: UpdateRecurringTemplateRequest, key?: string) => apiRequest<RecurringTemplate>(`/api/recurring-templates/${id}`, { method: 'PATCH', ...(key ? { headers: { 'Idempotency-Key': key } } : {}), body: JSON.stringify(input) }),
  preview: (input: RecurringPreviewRequest) => apiRequest<RecurringPreviewResponse>('/api/recurring-templates/preview', { method: 'POST', body: JSON.stringify(input) }),
  action: (id: string, action: 'pause'|'resume'|'end') => apiRequest<RecurringTemplate>(`/api/recurring-templates/${id}/${action}`, { method: 'POST' }),
};
