import { presentResponseError } from '@/lib/apiErrorCopy';
import type {
  AccountDto,
  CreateAccountRequest,
  CreatePaymentRequest,
  InitializeAccountsRequest,
  PaymentDto,
  UpdateAccountRequest,
} from '@ledgercraft/contracts';
import type { Account, AccountType } from '@/types';
import type { CreatePaymentRequest as ClientPaymentRequest, Payment } from '@/types/payment';

export function paymentsApiEnabled(): boolean {
  return import.meta.env.VITE_PAYMENTS_API !== 'false';
}

export function accountsApiEnabled(): boolean {
  return import.meta.env.VITE_ACCOUNTS_API !== 'false';
}

export class PaymentsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PaymentsApiError';
  }
}

function toPayment(dto: PaymentDto): Payment {
  return {
    id: dto.id,
    invoiceId: dto.invoiceId,
    invoiceNumber: dto.invoiceNumber ?? undefined,
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

const ACCOUNT_TYPES: AccountType[] = ['bank', 'cash', 'credit_card', 'loan', 'custom'];

function toAccount(dto: AccountDto): Account {
  return {
    id: dto.id,
    name: dto.name,
    type: ACCOUNT_TYPES.includes(dto.type as AccountType) ? (dto.type as AccountType) : 'custom',
    currency: dto.currency,
    openingBalance: Number(dto.openingBalance),
    currentBalance: Number(dto.currentBalance),
    accountNumber: dto.accountNumber,
    accountClass: dto.accountClass,
    isActive: dto.isActive,
    createdAt: undefined,
    updatedAt: undefined,
  };
}

async function parseError(response: Response): Promise<string> {
  return (await presentResponseError(response)).message;
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
    throw new PaymentsApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}

export function toCreatePaymentRequest(payment: ClientPaymentRequest): CreatePaymentRequest {
  return {
    invoiceId: payment.invoiceId,
    paymentMethod: payment.paymentMethod,
    amount: String(payment.amount),
    paymentDate: payment.paymentDate,
    referenceNumber: payment.referenceNumber ?? null,
    notes: payment.notes ?? null,
  };
}

export const paymentsApi = {
  async list(invoiceId?: string): Promise<Payment[]> {
    const query = invoiceId ? `?invoiceId=${encodeURIComponent(invoiceId)}` : '';
    const body = await request<{ payments: PaymentDto[] }>(`/api/payments${query}`);
    return body.payments.map(toPayment);
  },

  async get(id: string): Promise<Payment | null> {
    try {
      return toPayment(await request<PaymentDto>(`/api/payments/${id}`));
    } catch (error) {
      if (error instanceof PaymentsApiError && error.status === 404) return null;
      throw error;
    }
  },

  async create(input: CreatePaymentRequest): Promise<Payment> {
    return toPayment(
      await request<PaymentDto>('/api/payments', { method: 'POST', body: JSON.stringify(input) }),
    );
  },
};

export const accountsApi = {
  async list(): Promise<Account[]> {
    const body = await request<{ accounts: AccountDto[] }>('/api/accounts');
    return body.accounts.map(toAccount);
  },

  async create(input: CreateAccountRequest): Promise<Account> {
    return toAccount(
      await request<AccountDto>('/api/accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async update(id: string, input: UpdateAccountRequest): Promise<Account> {
    return toAccount(
      await request<AccountDto>(`/api/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },

  async initialize(input: InitializeAccountsRequest = {}): Promise<Account[]> {
    const body = await request<{ accounts: AccountDto[] }>('/api/accounts/initialize', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return body.accounts.map(toAccount);
  },
};
