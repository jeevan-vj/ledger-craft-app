import { presentResponseError } from '@/lib/apiErrorCopy';
import type {
  CreateExpenseCategoryRequest,
  CreateExpenseRequest,
  ExpenseCategoryDto,
  ExpenseDto,
  ExpenseListResponse,
  UpdateExpenseCategoryRequest,
  UpdateExpenseRequest,
} from '@ledgercraft/contracts';
import type { Expense, ExpenseCategory, ExpenseStatus, PaymentMethod } from '@/types';

export function expensesApiEnabled(): boolean {
  return import.meta.env.VITE_EXPENSES_API !== 'false';
}

export class ExpensesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ExpensesApiError';
  }
}

function money(value: number | string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value);
}

function toCategory(dto: ExpenseCategoryDto): ExpenseCategory {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    color: dto.color,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function toExpense(dto: ExpenseDto): Expense {
  return {
    id: dto.id,
    description: dto.description,
    amount: Number(dto.amount),
    taxAmount: Number(dto.taxAmount),
    currency: dto.currency,
    expenseDate: dto.expenseDate,
    status: dto.status as ExpenseStatus,
    isBillable: dto.isBillable,
    categoryId: dto.categoryId,
    category: dto.categoryId && dto.categoryName ? { id: dto.categoryId, name: dto.categoryName } : undefined,
    accountId: dto.accountId,
    account: dto.accountId && dto.accountName
      ? {
          id: dto.accountId,
          name: dto.accountName,
          type: 'custom',
          currency: dto.currency,
          openingBalance: 0,
          currentBalance: 0,
        }
      : undefined,
    customerId: dto.customerId,
    customer: dto.customerId && dto.customerName
      ? {
          id: dto.customerId,
          name: dto.customerName,
          email: '',
          address: null,
          city: null,
          state: null,
          zip: null,
          country: 'NZ',
          phone: null,
          isVip: false,
          tags: [],
        }
      : undefined,
    vendorName: dto.vendorName,
    receiptUrl: dto.receiptUrl,
    paymentMethod: dto.paymentMethod as PaymentMethod | null,
    notes: dto.notes,
    gstTreatment: dto.gstTreatment,
    gstExemptionReason: dto.gstExemptionReason,
    gstClaimablePercentage: dto.gstClaimablePercentage,
    privateUsePercentage: dto.privateUsePercentage,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toCreateExpenseRequest(
  expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>,
): CreateExpenseRequest {
  return {
    description: expense.description,
    amount: String(expense.amount),
    taxAmount: money(expense.taxAmount),
    currency: expense.currency || 'NZD',
    expenseDate: expense.expenseDate,
    status: expense.status,
    isBillable: expense.isBillable,
    categoryId: expense.categoryId ?? null,
    accountId: expense.accountId ?? null,
    customerId: expense.customerId ?? null,
    vendorName: expense.vendorName ?? null,
    receiptUrl: expense.receiptUrl ?? null,
    paymentMethod: expense.paymentMethod ?? null,
    notes: expense.notes ?? null,
    gstTreatment: expense.gstTreatment ?? 'standard',
    gstExemptionReason: expense.gstExemptionReason ?? 'none',
    gstClaimablePercentage: expense.gstClaimablePercentage ?? 100,
    privateUsePercentage: expense.privateUsePercentage ?? 0,
  };
}

export function toUpdateExpenseRequest(
  expense: Partial<Omit<Expense, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'account' | 'customer'>>,
): UpdateExpenseRequest {
  const input: UpdateExpenseRequest = {};
  if (expense.description !== undefined) input.description = expense.description;
  if (expense.amount !== undefined) input.amount = String(expense.amount);
  if (expense.taxAmount !== undefined) input.taxAmount = String(expense.taxAmount);
  if (expense.currency !== undefined) input.currency = expense.currency;
  if (expense.expenseDate !== undefined) input.expenseDate = expense.expenseDate;
  if (expense.status !== undefined) input.status = expense.status;
  if (expense.isBillable !== undefined) input.isBillable = expense.isBillable;
  if (expense.categoryId !== undefined) input.categoryId = expense.categoryId ?? null;
  if (expense.accountId !== undefined) input.accountId = expense.accountId ?? null;
  if (expense.customerId !== undefined) input.customerId = expense.customerId ?? null;
  if (expense.vendorName !== undefined) input.vendorName = expense.vendorName ?? null;
  if (expense.receiptUrl !== undefined) input.receiptUrl = expense.receiptUrl ?? null;
  if (expense.paymentMethod !== undefined) input.paymentMethod = expense.paymentMethod ?? null;
  if (expense.notes !== undefined) input.notes = expense.notes ?? null;
  if (expense.gstTreatment !== undefined) input.gstTreatment = expense.gstTreatment;
  if (expense.gstExemptionReason !== undefined) input.gstExemptionReason = expense.gstExemptionReason;
  if (expense.gstClaimablePercentage !== undefined) input.gstClaimablePercentage = expense.gstClaimablePercentage;
  if (expense.privateUsePercentage !== undefined) input.privateUsePercentage = expense.privateUsePercentage;
  return input;
}

export function toCreateExpenseCategoryRequest(
  category: Omit<ExpenseCategory, 'id' | 'createdAt' | 'updatedAt'>,
): CreateExpenseCategoryRequest {
  return {
    name: category.name,
    description: category.description ?? null,
    color: category.color ?? null,
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
    throw new ExpensesApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}

export const expensesApi = {
  async list(): Promise<ExpenseListResponse> {
    return request<ExpenseListResponse>('/api/expenses');
  },

  async listExpenses(): Promise<Expense[]> {
    const body = await this.list();
    return body.expenses.map(toExpense);
  },

  async get(id: string): Promise<Expense | null> {
    try {
      return toExpense(await request<ExpenseDto>(`/api/expenses/${id}`));
    } catch (error) {
      if (error instanceof ExpensesApiError && error.status === 404) return null;
      throw error;
    }
  },

  async create(input: CreateExpenseRequest): Promise<Expense> {
    return toExpense(await request<ExpenseDto>('/api/expenses', { method: 'POST', body: JSON.stringify(input) }));
  },

  async update(id: string, input: UpdateExpenseRequest): Promise<Expense> {
    return toExpense(
      await request<ExpenseDto>(`/api/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    );
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/api/expenses/${id}`, { method: 'DELETE' });
  },

  async listCategories(): Promise<ExpenseCategory[]> {
    const body = await request<{ categories: ExpenseCategoryDto[] }>('/api/expense-categories');
    return body.categories.map(toCategory);
  },

  async createCategory(input: CreateExpenseCategoryRequest): Promise<ExpenseCategory> {
    return toCategory(
      await request<ExpenseCategoryDto>('/api/expense-categories', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async updateCategory(id: string, input: UpdateExpenseCategoryRequest): Promise<ExpenseCategory> {
    return toCategory(
      await request<ExpenseCategoryDto>(`/api/expense-categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },

  async removeCategory(id: string): Promise<void> {
    await request<void>(`/api/expense-categories/${id}`, { method: 'DELETE' });
  },
};
