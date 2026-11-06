import type { AccountDto, OpeningBalancesRequest, OpeningBalancesResponse, LedgerAuditResponse, ApplyLedgerAuditRequest, ApplyLedgerAuditResponse, CreateJournalEntryRequest, JournalEntryDto } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
export const accountingApi = {
  async scope(): Promise<{ ownerId: string; organisationId: string }> { const me = await apiRequest<{ user: { id: string }; organisation: { id: string } }>('/api/me'); return { ownerId: me.user.id, organisationId: me.organisation.id }; },
  async accounts(): Promise<AccountDto[]> { return (await apiRequest<{ accounts: AccountDto[] }>('/api/accounts')).accounts.filter((account) => account.isActive && account.currency === 'NZD'); },
  open(input: OpeningBalancesRequest): Promise<OpeningBalancesResponse> { return apiRequest('/api/journal-entries/opening-balances', { method: 'POST', body: JSON.stringify(input) }); },
  createJournal(input: CreateJournalEntryRequest, key: string): Promise<JournalEntryDto> { return apiRequest('/api/journal-entries', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }); },
  postJournal(id: string): Promise<JournalEntryDto> { return apiRequest(`/api/journal-entries/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'posted' }) }); },
  audit(): Promise<LedgerAuditResponse> { return apiRequest('/api/journal-entries/ledger-audit'); },
  apply(input: ApplyLedgerAuditRequest): Promise<ApplyLedgerAuditResponse> { return apiRequest('/api/journal-entries/ledger-audit/apply', { method: 'POST', body: JSON.stringify(input) }); },
};
