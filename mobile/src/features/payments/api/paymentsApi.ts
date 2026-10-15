import { apiRequest } from '@/features/auth/api/http';
import type { Account } from '@/types/expense';
import type { Payment } from '@/types/payment';

export function paymentsApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_PAYMENTS_API !== 'false';
}

export function accountsApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ACCOUNTS_API !== 'false';
}

interface PaymentDto {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  paymentMethod: Payment['paymentMethod'];
  amount: string;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  status: Payment['status'];
  createdAt: string;
  updatedAt: string;
}

interface AccountDto {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  accountNumber: string | null;
  accountClass: string | null;
  isActive: boolean;
}

function toPayment(dto: PaymentDto): Payment {
  return {
    id: dto.id,
    invoiceId: dto.invoiceId,
    userId: '',
    paymentMethod: dto.paymentMethod,
    amount: Number(dto.amount),
    paymentDate: dto.paymentDate,
    referenceNumber: dto.referenceNumber ?? undefined,
    notes: dto.notes ?? undefined,
    status: dto.status,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function toAccount(dto: AccountDto): Account {
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type === 'bank' || dto.type === 'cash' || dto.type === 'credit_card' || dto.type === 'loan'
      ? dto.type
      : 'custom',
    currency: dto.currency,
    openingBalance: Number(dto.openingBalance),
    currentBalance: Number(dto.currentBalance),
  };
}

export const paymentsApi = {
  async list(invoiceId?: string): Promise<Payment[]> {
    const query = invoiceId ? `?invoiceId=${encodeURIComponent(invoiceId)}` : '';
    const body = await apiRequest<{ payments: PaymentDto[] }>(`/api/payments${query}`);
    return body.payments.map(toPayment);
  },

  async get(id: string): Promise<Payment> {
    return toPayment(await apiRequest<PaymentDto>(`/api/payments/${id}`));
  },

  async create(input: Record<string, unknown>): Promise<Payment> {
    return toPayment(
      await apiRequest<PaymentDto>('/api/payments', { method: 'POST', body: JSON.stringify(input) }),
    );
  },
};

export const accountsApi = {
  async list(): Promise<Account[]> {
    const body = await apiRequest<{ accounts: AccountDto[] }>('/api/accounts');
    return body.accounts.map(toAccount);
  },
};
