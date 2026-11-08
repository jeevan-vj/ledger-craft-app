import { accountListResponseSchema, accountSchema, createAccountRequestSchema, type CreateAccountRequest } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
import { bankingApi } from '@/features/banking/api/bankingApi';
export const chartAccountsApi = {
  async list() { return accountListResponseSchema.parse(await apiRequest('/api/accounts')).accounts; },
  access() { return apiRequest<{ user: { id: string }; organisation: { id: string }; permissions: string[] }>('/api/me'); },
  banks: bankingApi.listAccounts,
  async create(input: CreateAccountRequest, organisationId: string, key: string) { return accountSchema.parse(await apiRequest('/api/accounts', { method: 'POST', headers: { 'X-Expected-Organisation-ID': organisationId, 'Idempotency-Key': key }, body: JSON.stringify(createAccountRequestSchema.parse(input)) })); },
  async linkBank(bankAccountId: string, organisationId: string) { return accountSchema.parse(await apiRequest('/api/accounts/bank-ledger', { method: 'POST', headers: { 'X-Expected-Organisation-ID': organisationId }, body: JSON.stringify({ bankAccountId }) })); },
};
