import type { BookEntryDto, CreateReconciliationMatchRequest, CreateReconciliationSessionRequest, CreateReconciliationAdjustmentRequest, ReconciliationAdjustmentDto, ReconciliationSessionDto, ReconciliationSummaryDto } from '@ledgercraft/contracts';
import { reconciliationSummarySchema } from '@ledgercraft/contracts';
import { bankingRequest } from './bankingApi';
export const settlementMatchingApi = {
  addAdjustment: (sessionId: string, input: CreateReconciliationAdjustmentRequest, key?: string): Promise<ReconciliationAdjustmentDto> => bankingRequest(`/api/reconciliation-sessions/${sessionId}/adjustments`, { method: 'POST', ...(key ? { headers: { 'Idempotency-Key': key } } : {}), body: JSON.stringify(input) }),
  async entries(from: string, to: string): Promise<BookEntryDto[]> { return (await bankingRequest<{ entries: BookEntryDto[] }>(`/api/book-entries?${new URLSearchParams({ from, to })}`)).entries; },
  async sessions(bankAccountId: string): Promise<ReconciliationSessionDto[]> { return (await bankingRequest<{ sessions: ReconciliationSessionDto[] }>(`/api/reconciliation-sessions?${new URLSearchParams({ bankAccountId })}`)).sessions; },
  createSession(input: CreateReconciliationSessionRequest, key?: string): Promise<ReconciliationSessionDto> { return bankingRequest('/api/reconciliation-sessions', { method: 'POST', ...(key ? { headers: { 'Idempotency-Key': key } } : {}), body: JSON.stringify(input) }); },
  async summary(sessionId: string): Promise<ReconciliationSummaryDto> { return reconciliationSummarySchema.parse(await bankingRequest(`/api/reconciliation-sessions/${sessionId}/summary`)); },
  complete(sessionId: string): Promise<ReconciliationSessionDto> { return bankingRequest(`/api/reconciliation-sessions/${sessionId}/complete`, { method: 'POST', body: '{}' }); },
  match(sessionId: string, input: CreateReconciliationMatchRequest): Promise<unknown> { return bankingRequest(`/api/reconciliation-sessions/${sessionId}/matches`, { method: 'POST', body: JSON.stringify(input) }); },
};
