import type {
  AccountListResponse,
  BankAccountListResponse,
  BillDto,
  BillListResponse,
  BillPaymentDto,
  CreateBillRequest,
  CreateVendorRequest,
  RecordBillPaymentRequest,
  UpdateBillRequest,
  UpdateVendorRequest,
  VendorDto,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export class PurchasesApiError extends Error {
  readonly requestId?: string;

  constructor(message: string, readonly status: number, requestId?: string) {
    super(message);
    this.name = 'PurchasesApiError';
    this.requestId = requestId;
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
    throw new PurchasesApiError(failure.message, failure.status, failure.requestId);
  }
  return response.json() as Promise<T>;
}

export const purchasesApi = {
  async listVendors(): Promise<VendorDto[]> {
    return (await request<{ vendors: VendorDto[] }>('/api/vendors')).vendors;
  },
  createVendor(input: CreateVendorRequest) {
    return request<VendorDto>('/api/vendors', { method: 'POST', body: JSON.stringify(input) });
  },
  updateVendor(id: string, input: UpdateVendorRequest) {
    return request<VendorDto>(`/api/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  removeVendor(id: string) {
    return request<void>(`/api/vendors/${id}`, { method: 'DELETE' });
  },
  async listBills(): Promise<BillDto[]> {
    return (await request<BillListResponse>('/api/bills')).bills;
  },
  getBill(id: string) {
    return request<BillDto>(`/api/bills/${id}`);
  },
  createBill(input: CreateBillRequest) {
    return request<BillDto>('/api/bills', { method: 'POST', body: JSON.stringify(input) });
  },
  updateBill(id: string, input: UpdateBillRequest) {
    return request<BillDto>(`/api/bills/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  removeBill(id: string) {
    return request<void>(`/api/bills/${id}`, { method: 'DELETE' });
  },
  receiveBill(id: string) {
    return request<BillDto>(`/api/bills/${id}/receive`, { method: 'POST' });
  },
  voidBill(id: string) {
    return request<BillDto>(`/api/bills/${id}/void`, { method: 'POST' });
  },
  recordPayment(id: string, input: RecordBillPaymentRequest) {
    return request<BillPaymentDto>(`/api/bills/${id}/payments`, { method: 'POST', body: JSON.stringify(input) });
  },
  async listAccounts() {
    return (await request<AccountListResponse>('/api/accounts')).accounts;
  },
  async listBankAccounts() {
    return (await request<BankAccountListResponse>('/api/bank-accounts')).bankAccounts;
  },
};
