import { onlineManager } from '@tanstack/react-query';
import { apiRequest } from '@/features/auth/api/http';
import type { StatementTransactionInput } from '@/features/banking/model/statementImport';

export type BankAccountType = 'checking' | 'savings' | 'credit_card' | 'business';

export interface BankAccountDto {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  accountType: BankAccountType;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountWriteRequest {
  accountName: string;
  accountNumber: string;
  bankName: string;
  accountType: BankAccountType;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  isActive: boolean;
}

export interface BankTransactionDto {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amount: string;
  type: 'debit' | 'credit';
  balance: string | null;
  category: string | null;
  merchant: string | null;
  isReconciled: boolean;
  notes: string | null;
  source: 'import' | 'manual' | 'transfer' | 'feed';
  paymentMethod: 'bank_transfer' | 'cash' | 'card' | 'cheque' | 'other' | null;
  counterparty: string | null;
  transferId: string | null;
  splits: { id: string; category: string; description: string | null; amount: string }[];
  documentConnections: { id: string; documentType: 'invoice' | 'bill'; documentId: string; documentNumber: string; amount: string }[];
  attachments: { id: string; objectKey: string; filename: string; contentType: string; size: number }[];
  createdAt: string;
  updatedAt: string;
}

export interface BankTransactionWriteRequest {
  bankAccountId: string;
  transactionDate: string;
  description: string;
  reference?: string | null;
  amount: string;
  type: 'debit' | 'credit';
  category?: string | null;
  counterparty?: string | null;
  paymentMethod?: 'bank_transfer' | 'cash' | 'card' | 'cheque' | 'other' | null;
  notes?: string | null;
}

export interface BankTransferWriteRequest {
  exchangeRateId?: string;
  sourceAccountId: string;
  destinationAccountId: string;
  transactionDate: string;
  amount: string;
  description?: string;
  reference?: string | null;
}

export interface BankTransferDto {
  id: string;
  sourceAccountId: string;
  destinationAccountId: string;
  transactionDate: string;
  amount: string;
  currency: string;
  description: string;
  reference: string | null;
  sourceTransaction: BankTransactionDto;
  destinationTransaction: BankTransactionDto;
  createdAt: string;
  updatedAt: string;
}

export interface BankStatementImportRequest {
  bankAccountId: string;
  fileName: string;
  fileType: 'csv';
  skipDuplicates: boolean;
  transactions: StatementTransactionInput[];
}

export interface BankStatementImportResponse {
  importedCount: number;
  duplicatesSkipped: number;
  transactions: BankTransactionDto[];
}

export type ReconciliationStatus = 'unreconciled' | 'suggested' | 'reconciled';
export type ReconciliationDirection = 'any' | 'debit' | 'credit';

export interface BankTransactionFilters {
  status?: ReconciliationStatus;
  bankAccountId?: string;
  from?: string;
  to?: string;
  direction?: ReconciliationDirection;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface BankTransactionListResponse {
  transactions: BankTransactionDto[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface BankTransactionSuggestion {
  id: string;
  type: 'invoice' | 'bill' | 'expense' | 'matching_rule';
  date: string | null;
  description: string;
  reference: string | null;
  counterparty: string | null;
  amount: string | null;
  score: number;
  reasons: string[];
  matchingRuleId: string | null;
  targetAccountId: string | null;
  contactId: string | null;
}

export interface BankTransactionSuggestionResponse {
  transactionId: string;
  suggestions: BankTransactionSuggestion[];
}

export interface ReconciliationAllocation { documentType: 'invoice' | 'bill'; documentId: string; amount: string }
export interface ReconciliationSplit { accountId: string; amount: string; description?: string }
export interface AcceptReconciliationRequest {
  allocations: ReconciliationAllocation[];
  splits: ReconciliationSplit[];
  bankFee?: string;
  paymentDate?: string;
  reference?: string | null;
  notes?: string | null;
}

export interface BankReconciliationActionDto {
  id: string;
  transactionId: string;
  actionType: 'accept' | 'personal';
  journalEntryId: string;
  status: 'active' | 'reversed';
  paymentIds: string[];
  billPaymentIds: string[];
  createdAt: string;
  reversedAt: string | null;
}

export interface BankMatchingRuleDto {
  id: string;
  descriptionContains: string;
  amountMin: string | null;
  amountMax: string | null;
  direction: 'debit' | 'credit' | 'any';
  targetAccountId: string;
  contactId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankMatchingRuleWriteRequest {
  descriptionContains: string;
  amountMin?: string | null;
  amountMax?: string | null;
  direction?: 'debit' | 'credit' | 'any';
  targetAccountId: string;
  contactId?: string | null;
  enabled?: boolean;
}

export interface ReconciliationDocumentDto {
  id: string;
  number: string;
  partyName: string;
  date: string;
  balanceDue: string;
  currency: string;
  documentType: 'invoice' | 'bill';
}

export interface LedgerAccountDto { id: string; name: string; currency: string; isActive: boolean }

export function bankTransactionQuery(filters: BankTransactionFilters): string {
  const pairs: [string, string][] = [];
  if (filters.bankAccountId) pairs.push(['bankAccountId', filters.bankAccountId]);
  if (filters.from) pairs.push(['from', filters.from]);
  if (filters.to) pairs.push(['to', filters.to]);
  if (filters.status) pairs.push(['status', filters.status]);
  if (filters.direction) pairs.push(['direction', filters.direction]);
  if (filters.search?.trim()) pairs.push(['search', filters.search.trim()]);
  if (filters.page) pairs.push(['page', String(filters.page)]);
  if (filters.pageSize) pairs.push(['pageSize', String(filters.pageSize)]);
  return pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}

export function bankingRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.method && !['GET', 'HEAD'].includes(init.method) && !onlineManager.isOnline()) {
    return Promise.reject(new Error('You are offline. Reconnect and try again; nothing has been queued.'));
  }
  return apiRequest<T>(path, init);
}

export const bankingApi = {
  getDefaultAccount: () => bankingRequest<{ bankAccountId: string | null }>('/api/bank-default-account'),
  setDefaultAccount: (bankAccountId: string | null) => bankingRequest<{ bankAccountId: string | null }>('/api/bank-default-account', { method: 'PUT', body: JSON.stringify({ bankAccountId }) }),
  movements: (id: string, from: string, to: string) => bankingRequest<{ bankAccountId: string; currency: string; from: string; to: string; openingBalance: string; inflows: string; outflows: string; movement: string; closingBalance: string }>(`/api/bank-accounts/${id}/movements?${new URLSearchParams({ from, to })}`),
  async listAccounts(): Promise<BankAccountDto[]> {
    return (await bankingRequest<{ bankAccounts: BankAccountDto[] }>('/api/bank-accounts', { method: 'GET' })).bankAccounts;
  },
  getAccount(id: string): Promise<BankAccountDto> {
    return bankingRequest(`/api/bank-accounts/${id}`, { method: 'GET' });
  },
  createAccount(input: BankAccountWriteRequest): Promise<BankAccountDto> {
    return bankingRequest('/api/bank-accounts', { method: 'POST', body: JSON.stringify(input) });
  },
  updateAccount(id: string, input: Partial<BankAccountWriteRequest>): Promise<BankAccountDto> {
    return bankingRequest(`/api/bank-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  async removeAccount(id: string): Promise<void> {
    await bankingRequest<void>(`/api/bank-accounts/${id}`, { method: 'DELETE' });
  },
  async listTransactions(bankAccountId?: string): Promise<BankTransactionDto[]> {
    const query = bankAccountId ? `?bankAccountId=${encodeURIComponent(bankAccountId)}` : '';
    return (await bankingRequest<{ transactions: BankTransactionDto[] }>(`/api/bank-transactions${query}`, { method: 'GET' })).transactions;
  },
  listReconciliationTransactions(filters: BankTransactionFilters): Promise<BankTransactionListResponse> {
    const query = bankTransactionQuery(filters);
    return bankingRequest(`/api/bank-transactions${query ? `?${query}` : ''}`, { method: 'GET' });
  },
  suggestions(transactionId: string): Promise<BankTransactionSuggestionResponse> {
    return bankingRequest(`/api/bank-transactions/${transactionId}/suggestions`, { method: 'GET' });
  },
  async suggestionsBatch(transactionIds: string[]): Promise<Record<string, BankTransactionSuggestionResponse>> {
    if (transactionIds.length === 0) return {};
    const body = await bankingRequest<{ items: BankTransactionSuggestionResponse[] }>('/api/bank-transactions/suggestions/batch', {
      method: 'POST', body: JSON.stringify({ transactionIds }),
    });
    return Object.fromEntries(body.items.map((item) => [item.transactionId, item]));
  },
  acceptSuggestion(transactionId: string, input: AcceptReconciliationRequest): Promise<BankReconciliationActionDto> {
    return bankingRequest(`/api/bank-transactions/${transactionId}/accept`, { method: 'POST', body: JSON.stringify(input) });
  },
  markPersonal(transactionId: string, notes?: string | null): Promise<BankReconciliationActionDto> {
    return bankingRequest(`/api/bank-transactions/${transactionId}/personal`, { method: 'POST', body: JSON.stringify(notes ? { notes } : {}) });
  },
  undoReconciliation(transactionId: string, input: { reason: string; reversalDate: string }): Promise<BankReconciliationActionDto> {
    return bankingRequest(`/api/bank-transactions/${transactionId}/undo`, { method: 'POST', body: JSON.stringify(input) });
  },
  async listMatchingRules(): Promise<BankMatchingRuleDto[]> {
    return (await bankingRequest<{ rules: BankMatchingRuleDto[] }>('/api/bank-matching-rules', { method: 'GET' })).rules;
  },
  createMatchingRule(input: BankMatchingRuleWriteRequest): Promise<BankMatchingRuleDto> {
    return bankingRequest('/api/bank-matching-rules', { method: 'POST', body: JSON.stringify(input) });
  },
  updateMatchingRule(id: string, input: Partial<BankMatchingRuleWriteRequest>): Promise<BankMatchingRuleDto> {
    return bankingRequest(`/api/bank-matching-rules/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  async removeMatchingRule(id: string): Promise<void> {
    await bankingRequest<void>(`/api/bank-matching-rules/${id}`, { method: 'DELETE' });
  },
  async listLedgerAccounts(): Promise<LedgerAccountDto[]> {
    return (await bankingRequest<{ accounts: LedgerAccountDto[] }>('/api/accounts', { method: 'GET' })).accounts.filter((account) => account.isActive);
  },
  async listReconciliationDocuments(type: 'invoice' | 'bill'): Promise<ReconciliationDocumentDto[]> {
    if (type === 'invoice') {
      const body = await bankingRequest<{ invoices: { id: string; invoiceNumber: string; customerName: string | null; date: string; balanceDue: string; currency: string; status: string }[] }>('/api/invoices', { method: 'GET' });
      return body.invoices.filter((item) => !['draft', 'cancelled'].includes(item.status) && cents(item.balanceDue) > 0n).map((item) => ({ id: item.id, number: item.invoiceNumber, partyName: item.customerName ?? 'Customer', date: item.date, balanceDue: item.balanceDue, currency: item.currency, documentType: 'invoice' }));
    }
    const body = await bankingRequest<{ bills: { id: string; billNumber: string; vendorName: string; issueDate: string; balanceDue: string; currency: string; lifecycleStatus: string }[] }>('/api/bills', { method: 'GET' });
    return body.bills.filter((item) => item.lifecycleStatus === 'received' && cents(item.balanceDue) > 0n).map((item) => ({ id: item.id, number: item.billNumber, partyName: item.vendorName, date: item.issueDate, balanceDue: item.balanceDue, currency: item.currency, documentType: 'bill' }));
  },
  getTransaction(id: string): Promise<BankTransactionDto> {
    return bankingRequest(`/api/bank-transactions/${id}`, { method: 'GET' });
  },
  createTransaction(input: BankTransactionWriteRequest): Promise<BankTransactionDto> {
    return bankingRequest('/api/bank-transactions', { method: 'POST', body: JSON.stringify(input) });
  },
  updateTransaction(id: string, input: Partial<Omit<BankTransactionWriteRequest, 'bankAccountId'>>): Promise<BankTransactionDto> {
    return bankingRequest(`/api/bank-transactions/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  async removeTransaction(id: string): Promise<void> {
    await bankingRequest<void>(`/api/bank-transactions/${id}`, { method: 'DELETE' });
  },
  importTransactions(input: BankStatementImportRequest, idempotencyKey?: string): Promise<BankStatementImportResponse> {
    return bankingRequest('/api/bank-transactions/import', { method: 'POST', ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}), body: JSON.stringify(input) });
  },
  createTransfer(input: BankTransferWriteRequest, idempotencyKey: string): Promise<BankTransferDto> {
    return bankingRequest('/api/bank-transfers', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    });
  },
};

function cents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : 0n;
}
