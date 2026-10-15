import { apiRequest } from '@/features/auth/api/http';
import type { Expense, ExpenseCategory, ExpenseStatus, PaymentMethod } from '@/types/expense';

export function expensesApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_EXPENSES_API !== 'false';
}

interface ExpenseDto {
  id: string;
  description: string;
  amount: string;
  taxAmount: string;
  currency: string;
  expenseDate: string;
  status: ExpenseStatus;
  isBillable: boolean;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  customerId: string | null;
  customerName: string | null;
  vendorName: string | null;
  receiptUrl: string | null;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExpenseCategoryDto {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toExpense(dto: ExpenseDto): Expense {
  return {
    id: dto.id,
    description: dto.description,
    amount: Number(dto.amount),
    taxAmount: Number(dto.taxAmount),
    currency: dto.currency,
    expenseDate: dto.expenseDate,
    status: dto.status,
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
      ? { id: dto.customerId, name: dto.customerName, email: '' }
      : undefined,
    vendorName: dto.vendorName,
    receiptUrl: dto.receiptUrl,
    paymentMethod: dto.paymentMethod,
    notes: dto.notes,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toCategory(dto: ExpenseCategoryDto): ExpenseCategory {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    color: dto.color,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export const expensesApi = {
  async list(): Promise<Expense[]> {
    const body = await apiRequest<{ expenses: ExpenseDto[] }>('/api/expenses');
    return body.expenses.map(toExpense);
  },

  async get(id: string): Promise<Expense> {
    return toExpense(await apiRequest<ExpenseDto>(`/api/expenses/${id}`));
  },

  async create(input: Record<string, unknown>): Promise<Expense> {
    return toExpense(await apiRequest<ExpenseDto>('/api/expenses', { method: 'POST', body: JSON.stringify(input) }));
  },

  async update(id: string, input: Record<string, unknown>): Promise<Expense> {
    return toExpense(
      await apiRequest<ExpenseDto>(`/api/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    );
  },

  async remove(id: string): Promise<void> {
    await apiRequest<void>(`/api/expenses/${id}`, { method: 'DELETE' });
  },

  async listCategories(): Promise<ExpenseCategory[]> {
    const body = await apiRequest<{ categories: ExpenseCategoryDto[] }>('/api/expense-categories');
    return body.categories.map(toCategory);
  },

  async createCategory(input: Record<string, unknown>): Promise<ExpenseCategory> {
    return toCategory(
      await apiRequest<ExpenseCategoryDto>('/api/expense-categories', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async updateCategory(id: string, input: Record<string, unknown>): Promise<ExpenseCategory> {
    return toCategory(
      await apiRequest<ExpenseCategoryDto>(`/api/expense-categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },

  async removeCategory(id: string): Promise<void> {
    await apiRequest<void>(`/api/expense-categories/${id}`, { method: 'DELETE' });
  },
};
