import { apiRequest } from '@/features/auth/api/http';

export interface VendorDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  paymentTermDays: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillLineInput {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  accountId?: string | null;
}

export interface BillLineDto extends BillLineInput {
  id: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  accountId: string | null;
  accountName: string | null;
}

export interface BillDto {
  id: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  vendorReference: string | null;
  issueDate: string;
  dueDate: string;
  lifecycleStatus: 'draft' | 'received' | 'void';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  displayStatus: 'draft' | 'received' | 'overdue' | 'partial' | 'paid' | 'void';
  currency: string;
  taxInclusive: boolean;
  subtotal: string;
  taxAmount: string;
  total: string;
  totalPaid: string;
  balanceDue: string;
  notes: string | null;
  lines: BillLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface BillWriteRequest {
  vendorId: string;
  vendorReference?: string | null;
  issueDate: string;
  dueDate: string;
  currency?: string;
  taxInclusive?: boolean;
  notes?: string | null;
  lines: BillLineInput[];
}

export interface RecordBillPaymentRequest {
  bankAccountId: string;
  amount: string;
  paymentDate: string;
  referenceNumber?: string | null;
  notes?: string | null;
}

export interface BillPaymentDto {
  id: string;
  billId: string;
  bankAccountId: string;
  bankAccountName: string;
  amount: string;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AccountDto {
  id: string;
  name: string;
  type: string;
  currency: string;
  accountNumber: string | null;
  accountClass: string | null;
  isActive: boolean;
}

export interface BankAccountDto {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  currency: string;
  currentBalance: string;
  isActive: boolean;
}

export const purchasesApi = {
  async listVendors(): Promise<VendorDto[]> {
    return (await apiRequest<{ vendors: VendorDto[] }>('/api/vendors', { method: 'GET' })).vendors;
  },
  async listBills(): Promise<BillDto[]> {
    return (await apiRequest<{ bills: BillDto[] }>('/api/bills', { method: 'GET' })).bills;
  },
  getBill(id: string): Promise<BillDto> {
    return apiRequest(`/api/bills/${id}`, { method: 'GET' });
  },
  createBill(input: BillWriteRequest): Promise<BillDto> {
    return apiRequest('/api/bills', { method: 'POST', body: JSON.stringify(input) });
  },
  updateBill(id: string, input: Partial<BillWriteRequest>): Promise<BillDto> {
    return apiRequest(`/api/bills/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  receiveBill(id: string): Promise<BillDto> {
    return apiRequest(`/api/bills/${id}/receive`, { method: 'POST' });
  },
  voidBill(id: string): Promise<BillDto> {
    return apiRequest(`/api/bills/${id}/void`, { method: 'POST' });
  },
  recordPayment(id: string, input: RecordBillPaymentRequest): Promise<BillPaymentDto> {
    return apiRequest(`/api/bills/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async listAccounts(): Promise<AccountDto[]> {
    return (await apiRequest<{ accounts: AccountDto[] }>('/api/accounts', { method: 'GET' })).accounts;
  },
  async listBankAccounts(): Promise<BankAccountDto[]> {
    return (await apiRequest<{ bankAccounts: BankAccountDto[] }>('/api/bank-accounts', { method: 'GET' })).bankAccounts;
  },
};
