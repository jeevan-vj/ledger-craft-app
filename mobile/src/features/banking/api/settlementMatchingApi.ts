import type { BookEntryDto, CreateReconciliationMatchRequest, CreateReconciliationSessionRequest, ReconciliationSessionDto, ReconciliationSummaryDto } from '@ledgercraft/contracts';
import { reconciliationSummarySchema } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
export const settlementMatchingApi = {
  async entries(from: string, to: string): Promise<BookEntryDto[]> { return (await apiRequest<{ entries: BookEntryDto[] }>(`/api/book-entries?${new URLSearchParams({ from, to })}`)).entries; },
  async sessions(bankAccountId: string): Promise<ReconciliationSessionDto[]> { return (await apiRequest<{ sessions: ReconciliationSessionDto[] }>(`/api/reconciliation-sessions?${new URLSearchParams({ bankAccountId })}`)).sessions; },
  createSession(input: CreateReconciliationSessionRequest): Promise<ReconciliationSessionDto> { return apiRequest('/api/reconciliation-sessions', { method: 'POST', body: JSON.stringify(input) }); },
  async summary(sessionId: string): Promise<ReconciliationSummaryDto> { return reconciliationSummarySchema.parse(await apiRequest(`/api/reconciliation-sessions/${sessionId}/summary`)); },
  complete(sessionId: string): Promise<ReconciliationSessionDto> { return apiRequest(`/api/reconciliation-sessions/${sessionId}/complete`, { method: 'POST', body: '{}' }); },
  match(sessionId: string, input: CreateReconciliationMatchRequest): Promise<unknown> { return apiRequest(`/api/reconciliation-sessions/${sessionId}/matches`, { method: 'POST', body: JSON.stringify(input) }); },
};
