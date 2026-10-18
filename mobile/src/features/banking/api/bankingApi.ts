import { apiRequest } from '@/features/auth/api/http';

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
  createdAt: string;
  updatedAt: string;
}

export const bankingApi = {
  async listAccounts(): Promise<BankAccountDto[]> {
    return (await apiRequest<{ bankAccounts: BankAccountDto[] }>('/api/bank-accounts', { method: 'GET' })).bankAccounts;
  },
  getAccount(id: string): Promise<BankAccountDto> {
    return apiRequest(`/api/bank-accounts/${id}`, { method: 'GET' });
  },
  createAccount(input: BankAccountWriteRequest): Promise<BankAccountDto> {
    return apiRequest('/api/bank-accounts', { method: 'POST', body: JSON.stringify(input) });
  },
  updateAccount(id: string, input: Partial<BankAccountWriteRequest>): Promise<BankAccountDto> {
    return apiRequest(`/api/bank-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  async removeAccount(id: string): Promise<void> {
    await apiRequest<void>(`/api/bank-accounts/${id}`, { method: 'DELETE' });
  },
  async listTransactions(bankAccountId?: string): Promise<BankTransactionDto[]> {
    const query = bankAccountId ? `?bankAccountId=${encodeURIComponent(bankAccountId)}` : '';
    return (await apiRequest<{ transactions: BankTransactionDto[] }>(`/api/bank-transactions${query}`, { method: 'GET' })).transactions;
  },
};
