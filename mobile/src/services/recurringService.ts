import { apiRequest } from '@/features/auth/api/http';
export type RecurringTemplate = { id: string; name: string; kind: 'invoice'|'bill'|'income'|'expense'; status: 'active'|'paused'|'ended'; schedule: { frequency: string; timezone: string }; nextRunAt: string|null; occurrencesCreated: number };
export type RecurringRun = { id: string; generatedType: string; status: 'running'|'succeeded'|'failed'; scheduledFor: string; failureReason: string|null };
export const recurringService = {
  list: () => apiRequest<{ templates: RecurringTemplate[] }>('/api/recurring-templates'),
  runs: () => apiRequest<{ runs: RecurringRun[] }>('/api/recurring-runs'),
  createExpense: (input: { name: string; description: string; amount: string; startDate: string; frequency: string; timezone: string }) => apiRequest<RecurringTemplate>('/api/recurring-templates', { method: 'POST', body: JSON.stringify({ name: input.name, payload: { kind: 'expense', input: { description: input.description, amount: input.amount, expenseDate: input.startDate } }, schedule: { frequency: input.frequency, interval: 1, startDate: input.startDate, timezone: input.timezone, localTime: '09:00' } }) }),
  action: (id: string, action: 'pause'|'resume'|'end') => apiRequest<RecurringTemplate>(`/api/recurring-templates/${id}/${action}`, { method: 'POST' }),
};
