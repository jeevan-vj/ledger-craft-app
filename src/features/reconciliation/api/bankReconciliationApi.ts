import type {
  AcceptBankTransactionSuggestionRequest,
  AccountDto,
  BankMatchingRuleDto,
  BankReconciliationActionDto,
  BankTransactionDto,
  BankTransactionListQuery,
  BankTransactionListResponse,
  BankTransactionSuggestionResponse,
  BillDto,
  CreateBankMatchingRuleRequest,
  InvoiceDto,
  MarkBankTransactionPersonalRequest,
  UndoBankTransactionReconciliationRequest,
  UpdateBankMatchingRuleRequest,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export class BankReconciliationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'BankReconciliationApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new BankReconciliationApiError(failure.message, failure.status, failure.code, failure.requestId);
  }
  return response.json() as Promise<T>;
}

function transactionQuery(filters: Partial<BankTransactionListQuery>) {
  const params = new URLSearchParams();
  if (filters.bankAccountId) params.set('bankAccountId', filters.bankAccountId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.status) params.set('status', filters.status);
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  return params.toString();
}

export const bankReconciliationApi = {
  listTransactions(filters: Partial<BankTransactionListQuery>): Promise<BankTransactionListResponse> {
    const query = transactionQuery(filters);
    return request<BankTransactionListResponse>(`/api/bank-transactions${query ? `?${query}` : ''}`);
  },

  suggestions(transactionId: string): Promise<BankTransactionSuggestionResponse> {
    return request<BankTransactionSuggestionResponse>(`/api/bank-transactions/${transactionId}/suggestions`);
  },

  async suggestionsBatch(transactionIds: string[]): Promise<Map<string, BankTransactionSuggestionResponse>> {
    if (transactionIds.length === 0) return new Map();
    const body = await request<{ items: BankTransactionSuggestionResponse[] }>('/api/bank-transactions/suggestions/batch', {
      method: 'POST',
      body: JSON.stringify({ transactionIds }),
    });
    return new Map(body.items.map((item) => [item.transactionId, item]));
  },

  accept(transactionId: string, input: AcceptBankTransactionSuggestionRequest): Promise<BankReconciliationActionDto> {
    return request<BankReconciliationActionDto>(`/api/bank-transactions/${transactionId}/accept`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  personal(transactionId: string, input: MarkBankTransactionPersonalRequest = {}): Promise<BankReconciliationActionDto> {
    return request<BankReconciliationActionDto>(`/api/bank-transactions/${transactionId}/personal`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  undo(transactionId: string, input: UndoBankTransactionReconciliationRequest): Promise<BankReconciliationActionDto> {
    return request<BankReconciliationActionDto>(`/api/bank-transactions/${transactionId}/undo`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async openInvoices(): Promise<InvoiceDto[]> {
    const body = await request<{ invoices: InvoiceDto[] }>('/api/invoices');
    return body.invoices.filter((invoice) => !['draft', 'cancelled'].includes(invoice.status) && cents(invoice.balanceDue) > 0n);
  },

  async openBills(): Promise<BillDto[]> {
    const body = await request<{ bills: BillDto[] }>('/api/bills');
    return body.bills.filter((bill) => bill.lifecycleStatus === 'received' && cents(bill.balanceDue) > 0n);
  },

  async accounts(): Promise<AccountDto[]> {
    return (await request<{ accounts: AccountDto[] }>('/api/accounts')).accounts.filter((account) => account.isActive);
  },

  async rules(): Promise<BankMatchingRuleDto[]> {
    return (await request<{ rules: BankMatchingRuleDto[] }>('/api/bank-matching-rules')).rules;
  },

  createRule(input: CreateBankMatchingRuleRequest): Promise<BankMatchingRuleDto> {
    return request<BankMatchingRuleDto>('/api/bank-matching-rules', { method: 'POST', body: JSON.stringify(input) });
  },

  updateRule(id: string, input: UpdateBankMatchingRuleRequest): Promise<BankMatchingRuleDto> {
    return request<BankMatchingRuleDto>(`/api/bank-matching-rules/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },

  removeRule(id: string): Promise<void> {
    return request<void>(`/api/bank-matching-rules/${id}`, { method: 'DELETE' });
  },
};

export function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return 0n;
  const fraction = (match[3] ?? '').padEnd(2, '0');
  const amount = BigInt(match[2]) * 100n + BigInt(fraction || '0');
  return match[1] === '-' ? -amount : amount;
}

export function moneyFromCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
