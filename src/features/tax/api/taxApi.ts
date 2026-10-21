import type {
  CreateTaxReturnRequest,
  FileTaxReturnRequest,
  TaxConfigurationDto,
  TaxReturnDto,
  TaxReturnListResponse,
  UpdateTaxReturnRequest,
  UpsertTaxConfigurationRequest,
} from '@ledgercraft/contracts';
import { expensesApi, expensesApiEnabled } from '@/features/expenses/api/expensesApi';
import { invoicesApi, invoicesApiEnabled } from '@/features/invoices/api/invoicesApi';
import { paymentsApi, paymentsApiEnabled } from '@/features/payments/api/paymentsApi';
import { readApiFailure } from '@/lib/api/readApiError';
import type { Payment, TaxConfiguration, TaxReturn } from '@/types/payment';
import { toPeriodExpense, toPeriodInvoice, type PeriodExpense, type PeriodInvoice } from './periodRows';

export function taxApiEnabled(): boolean {
  return import.meta.env.VITE_TAX_API === 'true';
}

export class TaxApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'TaxApiError';
    this.requestId = requestId;
  }
}

export function toTaxConfiguration(dto: TaxConfigurationDto): TaxConfiguration {
  return {
    id: dto.id,
    userId: '',
    countryCode: dto.countryCode,
    taxType: dto.taxType,
    taxRate: Number(dto.taxRate),
    taxName: dto.taxName,
    appliesToServices: dto.appliesToServices,
    appliesToGoods: dto.appliesToGoods,
    effectiveFrom: dto.effectiveFrom,
    effectiveTo: dto.effectiveTo ?? undefined,
    isActive: dto.isActive,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toTaxReturn(dto: TaxReturnDto): TaxReturn {
  return {
    id: dto.id,
    userId: '',
    periodStart: dto.periodStart,
    periodEnd: dto.periodEnd,
    returnType: dto.returnType,
    totalSales: Number(dto.totalSales),
    totalPurchases: Number(dto.totalPurchases),
    gstOnSales: Number(dto.gstOnSales),
    gstOnPurchases: Number(dto.gstOnPurchases),
    netGst: Number(dto.netGst),
    status: dto.status,
    submittedAt: dto.submittedAt ?? undefined,
    irdReference: dto.irdReference ?? undefined,
    returnData: dto.returnData ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
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
    const failure = await readApiFailure(response);
    throw new TaxApiError(failure.message, failure.status, failure.requestId);
  }
  return (await response.json()) as T;
}

export const taxApi = {
  async getConfiguration(countryCode = 'NZ'): Promise<TaxConfiguration> {
    const query = countryCode ? `?countryCode=${encodeURIComponent(countryCode)}` : '';
    return toTaxConfiguration(await request<TaxConfigurationDto>(`/api/tax-configurations${query}`));
  },

  async upsertConfiguration(input: UpsertTaxConfigurationRequest): Promise<TaxConfiguration> {
    return toTaxConfiguration(
      await request<TaxConfigurationDto>('/api/tax-configurations', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    );
  },

  async listReturns(): Promise<TaxReturn[]> {
    const body = await request<TaxReturnListResponse>('/api/tax-returns');
    return body.taxReturns.map(toTaxReturn);
  },

  async getReturn(id: string): Promise<TaxReturn | null> {
    try {
      return toTaxReturn(await request<TaxReturnDto>(`/api/tax-returns/${id}`));
    } catch (error) {
      if (error instanceof TaxApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createReturn(input: CreateTaxReturnRequest): Promise<TaxReturn> {
    return toTaxReturn(
      await request<TaxReturnDto>('/api/tax-returns', { method: 'POST', body: JSON.stringify(input) }),
    );
  },

  async fileReturn(id: string, input: FileTaxReturnRequest): Promise<TaxReturn> {
    return toTaxReturn(
      await request<TaxReturnDto>(`/api/tax-returns/${id}/file`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async updateReturn(id: string, input: UpdateTaxReturnRequest): Promise<TaxReturn> {
    return toTaxReturn(
      await request<TaxReturnDto>(`/api/tax-returns/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    );
  },

  async removeReturn(id: string): Promise<void> {
    await request<void>(`/api/tax-returns/${id}`, { method: 'DELETE' });
  },

  async invoicesByPeriod(periodStart: string, periodEnd: string): Promise<PeriodInvoice[]> {
    if (!invoicesApiEnabled() && !taxApiEnabled()) return [];
    const invoices = await invoicesApi.list();
    return invoices
      .filter((invoice) => {
        const date = invoice.date.slice(0, 10);
        return date >= periodStart && date <= periodEnd;
      })
      .map(toPeriodInvoice);
  },

  async expensesByPeriod(periodStart: string, periodEnd: string): Promise<PeriodExpense[]> {
    if (!expensesApiEnabled() && !taxApiEnabled()) return [];
    const expenses = await expensesApi.listExpenses();
    return expenses
      .filter((expense) => {
        const date = String(expense.expenseDate).slice(0, 10);
        return date >= periodStart && date <= periodEnd;
      })
      .map(toPeriodExpense);
  },

  async paymentsByPeriod(periodStart: string, periodEnd: string): Promise<Payment[]> {
    if (!paymentsApiEnabled() && !taxApiEnabled()) return [];
    const payments = await paymentsApi.list();
    return payments.filter((payment) => {
      const date = payment.paymentDate.slice(0, 10);
      return date >= periodStart && date <= periodEnd;
    });
  },
};
