import type {
  BankAccountDto,
  BankAccountListResponse,
  BankTransactionDto,
  BankTransferDto,
  CreateBankTransactionRequest,
  CreateBankTransferRequest,
  CreateBankAccountRequest,
  ImportBankTransactionsRequest,
  ImportBankTransactionsResponse,
  UpdateBankAccountRequest,
  UpdateBankTransactionRequest,
} from '@ledgercraft/contracts';
import type { BankAccount, BankTransaction } from '@/types/bankTransaction';

export function bankApiEnabled(): boolean {
  return import.meta.env.VITE_BANK_API === 'true';
}

export class BankApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BankApiError';
  }
}

function money(value: number | string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value);
}

export function toBankAccount(dto: BankAccountDto): BankAccount {
  return {
    id: dto.id,
    accountName: dto.accountName,
    accountNumber: dto.accountNumber,
    bankName: dto.bankName,
    accountType: dto.accountType,
    currency: dto.currency,
    openingBalance: Number(dto.openingBalance),
    currentBalance: Number(dto.currentBalance),
    isActive: dto.isActive,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toBankTransaction(dto: BankTransactionDto): BankTransaction {
  return {
    id: dto.id,
    bankAccountId: dto.bankAccountId,
    transactionDate: dto.transactionDate,
    description: dto.description,
    reference: dto.reference ?? undefined,
    amount: Number(dto.amount),
    type: dto.type,
    balance: dto.balance == null ? undefined : Number(dto.balance),
    category: dto.category ?? undefined,
    merchant: dto.merchant ?? undefined,
    isReconciled: dto.isReconciled,
    notes: dto.notes ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toCreateBankAccountRequest(
  account: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>,
): CreateBankAccountRequest {
  return {
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    bankName: account.bankName,
    accountType: account.accountType,
    currency: account.currency || 'NZD',
    openingBalance: money(account.openingBalance),
    currentBalance: money(account.currentBalance),
    isActive: account.isActive,
  };
}

export function toUpdateBankAccountRequest(
  account: Partial<Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>>,
): UpdateBankAccountRequest {
  const input: UpdateBankAccountRequest = {};
  if (account.accountName !== undefined) input.accountName = account.accountName;
  if (account.accountNumber !== undefined) input.accountNumber = account.accountNumber;
  if (account.bankName !== undefined) input.bankName = account.bankName;
  if (account.accountType !== undefined) input.accountType = account.accountType;
  if (account.currency !== undefined) input.currency = account.currency;
  if (account.openingBalance !== undefined) input.openingBalance = String(account.openingBalance);
  if (account.currentBalance !== undefined) input.currentBalance = String(account.currentBalance);
  if (account.isActive !== undefined) input.isActive = account.isActive;
  return input;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  if (!response.ok) {
    throw new BankApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}

export const bankApi = {
  async listAccounts(): Promise<BankAccount[]> {
    const body = await request<BankAccountListResponse>('/api/bank-accounts');
    return body.bankAccounts.map(toBankAccount);
  },

  async getAccount(id: string): Promise<BankAccount | null> {
    try {
      return toBankAccount(await request<BankAccountDto>(`/api/bank-accounts/${id}`));
    } catch (error) {
      if (error instanceof BankApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createAccount(input: CreateBankAccountRequest): Promise<BankAccount> {
    return toBankAccount(
      await request<BankAccountDto>('/api/bank-accounts', { method: 'POST', body: JSON.stringify(input) }),
    );
  },

  async updateAccount(id: string, input: UpdateBankAccountRequest): Promise<BankAccount> {
    return toBankAccount(
      await request<BankAccountDto>(`/api/bank-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    );
  },

  async removeAccount(id: string): Promise<void> {
    await request<void>(`/api/bank-accounts/${id}`, { method: 'DELETE' });
  },

  async listTransactions(filters?: {
    bankAccountId?: string;
    from?: string;
    to?: string;
  }): Promise<BankTransaction[]> {
    const params = new URLSearchParams();
    if (filters?.bankAccountId) params.set('bankAccountId', filters.bankAccountId);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    const query = params.toString();
    const body = await request<{ transactions: BankTransactionDto[] }>(
      `/api/bank-transactions${query ? `?${query}` : ''}`,
    );
    return body.transactions.map(toBankTransaction);
  },

  async listTransactionDtos(filters?: { bankAccountId?: string; from?: string; to?: string }): Promise<BankTransactionDto[]> {
    const params = new URLSearchParams();
    if (filters?.bankAccountId) params.set('bankAccountId', filters.bankAccountId);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    const query = params.toString();
    return (await request<{ transactions: BankTransactionDto[] }>(`/api/bank-transactions${query ? `?${query}` : ''}`)).transactions;
  },

  async importTransactions(input: ImportBankTransactionsRequest): Promise<ImportBankTransactionsResponse> {
    return request<ImportBankTransactionsResponse>('/api/bank-transactions/import', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getTransaction(id: string): Promise<BankTransactionDto> {
    return request<BankTransactionDto>(`/api/bank-transactions/${id}`);
  },

  createTransaction(input: CreateBankTransactionRequest): Promise<BankTransactionDto> {
    return request<BankTransactionDto>('/api/bank-transactions', { method: 'POST', body: JSON.stringify(input) });
  },

  updateTransaction(id: string, input: UpdateBankTransactionRequest): Promise<BankTransactionDto> {
    return request<BankTransactionDto>(`/api/bank-transactions/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },

  async removeTransaction(id: string): Promise<void> {
    await request<void>(`/api/bank-transactions/${id}`, { method: 'DELETE' });
  },

  createTransfer(input: CreateBankTransferRequest, idempotencyKey: string): Promise<BankTransferDto> {
    return request<BankTransferDto>('/api/bank-transfers', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    });
  },
};
