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
  source: 'import' | 'manual' | 'transfer';
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
  getTransaction(id: string): Promise<BankTransactionDto> {
    return apiRequest(`/api/bank-transactions/${id}`, { method: 'GET' });
  },
  createTransaction(input: BankTransactionWriteRequest): Promise<BankTransactionDto> {
    return apiRequest('/api/bank-transactions', { method: 'POST', body: JSON.stringify(input) });
  },
  updateTransaction(id: string, input: Partial<Omit<BankTransactionWriteRequest, 'bankAccountId'>>): Promise<BankTransactionDto> {
    return apiRequest(`/api/bank-transactions/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  async removeTransaction(id: string): Promise<void> {
    await apiRequest<void>(`/api/bank-transactions/${id}`, { method: 'DELETE' });
  },
  importTransactions(input: BankStatementImportRequest): Promise<BankStatementImportResponse> {
    return apiRequest('/api/bank-transactions/import', { method: 'POST', body: JSON.stringify(input) });
  },
  createTransfer(input: BankTransferWriteRequest, idempotencyKey: string): Promise<BankTransferDto> {
    return apiRequest('/api/bank-transfers', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    });
  },
};
