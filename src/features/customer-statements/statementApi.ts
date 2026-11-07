import { z } from 'zod';
import { customerStatementSchema, reminderSettingsSchema, reminderSettingsRequestSchema, statementShareSchema, reminderLogSchema, type CustomerStatementQuery, type ReminderSettingsRequest } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';
async function request<T>(path: string, schema: z.ZodType<T>, method = 'GET', body?: unknown, key?: string): Promise<T> {
  const response = await fetch(path, { method, credentials: 'include', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return schema.parse(await response.json());
}
const success = z.object({}).passthrough();
export const statementApi = {
  get: (id: string, query: CustomerStatementQuery) => request(`/api/customers/${encodeURIComponent(id)}/statement?${new URLSearchParams(query)}`, customerStatementSchema),
  share: (id: string, query: CustomerStatementQuery) => request(`/api/customers/${encodeURIComponent(id)}/statement/share`, statementShareSchema, 'POST', query),
  send: (id: string, query: CustomerStatementQuery, key?: string) => request(`/api/customers/${encodeURIComponent(id)}/statement/send`, success, 'POST', query, key),
  bulk: (customerIds: string[], query: CustomerStatementQuery, key?: string) => request('/api/customer-statements/send-bulk', success, 'POST', { customerIds, ...query }, key),
  public: (token: string) => request(`/api/public/customer-statements/${encodeURIComponent(token)}`, customerStatementSchema),
  settings: () => request('/api/payment-reminders/settings', reminderSettingsSchema),
  saveSettings: (body: ReminderSettingsRequest) => request('/api/payment-reminders/settings', reminderSettingsSchema, 'PUT', reminderSettingsRequestSchema.parse(body)),
  optOut: (kind: 'customers' | 'invoices', id: string) => request(`/api/payment-reminders/${kind}/${encodeURIComponent(id)}`, z.object({ optOut: z.boolean() })),
  saveOptOut: (kind: 'customers' | 'invoices', id: string, optOut: boolean) => request(`/api/payment-reminders/${kind}/${encodeURIComponent(id)}`, z.object({ optOut: z.boolean() }), 'PUT', { optOut }),
  logs: (invoiceId: string) => request(`/api/invoices/${encodeURIComponent(invoiceId)}/reminder-log`, z.object({ logs: z.array(reminderLogSchema) })),
};
