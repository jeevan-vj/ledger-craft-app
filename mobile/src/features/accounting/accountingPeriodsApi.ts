import { accountingPeriodStateSchema, closeAccountingPeriodRequestSchema, reopenAccountingPeriodRequestSchema, type CloseAccountingPeriodRequest, type ReopenAccountingPeriodRequest } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
export const accountingPeriodsApi = {
  access() { return apiRequest<{ user: { id: string }; organisation: { id: string }; permissions: string[] }>('/api/me'); },
  async get(organisationId: string) { return accountingPeriodStateSchema.parse(await apiRequest('/api/accounting-periods', { headers: { 'X-Expected-Organisation-ID': organisationId } })); },
  async close(input: CloseAccountingPeriodRequest, organisationId: string) { return accountingPeriodStateSchema.parse(await apiRequest('/api/accounting-periods/close', { method: 'POST', headers: { 'X-Expected-Organisation-ID': organisationId }, body: JSON.stringify(closeAccountingPeriodRequestSchema.parse(input)) })); },
  async reopen(input: ReopenAccountingPeriodRequest, organisationId: string) { return accountingPeriodStateSchema.parse(await apiRequest('/api/accounting-periods/reopen', { method: 'POST', headers: { 'X-Expected-Organisation-ID': organisationId }, body: JSON.stringify(reopenAccountingPeriodRequestSchema.parse(input)) })); },
};
