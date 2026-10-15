import { useQuery } from '@tanstack/react-query';
import { accountsApi, accountsApiEnabled, paymentsApi, paymentsApiEnabled } from '@/features/payments/api/paymentsApi';
import { businessProfileApi, businessProfileApiEnabled } from '@/features/business-profile/api/businessProfileApi';
import { expensesApi, expensesApiEnabled } from '@/features/expenses/api/expensesApi';
import { invoicesApi, invoicesApiEnabled } from '@/features/invoices/api/invoicesApi';
import { itemsApi, itemsApiEnabled } from '@/features/items/api/itemsApi';
import { receiptsApi, receiptsApiEnabled } from '@/features/receipts/api/receiptsApi';
import { customersQueryKey } from '@/features/customers/hooks/useCustomers';

export const ledgerQueryKeys = {
  customers: customersQueryKey,
  invoices: ['invoices'] as const,
  expenses: ['expenses'] as const,
  expenseCategories: ['expense-categories'] as const,
  items: ['items'] as const,
  accounts: ['accounts'] as const,
  businessProfile: ['business-profile'] as const,
  payments: ['payments'] as const,
  receipts: ['receipts'] as const,
};

export function useInvoicesQuery() {
  return useQuery({
    queryKey: ledgerQueryKeys.invoices,
    queryFn: () => invoicesApi.list(),
    enabled: invoicesApiEnabled(),
  });
}

export function useExpensesQuery() {
  return useQuery({
    queryKey: ledgerQueryKeys.expenses,
    queryFn: () => expensesApi.listExpenses(),
    enabled: expensesApiEnabled(),
  });
}

export function useExpenseCategoriesQuery() {
  return useQuery({
    queryKey: ledgerQueryKeys.expenseCategories,
    queryFn: () => expensesApi.listCategories(),
    enabled: expensesApiEnabled(),
  });
}

export function useItemsQuery() {
  return useQuery({
    queryKey: ledgerQueryKeys.items,
    queryFn: () => itemsApi.list(),
    enabled: itemsApiEnabled(),
  });
}

export function useAccountsQuery() {
  return useQuery({
    queryKey: ledgerQueryKeys.accounts,
    queryFn: () => accountsApi.list(),
    enabled: accountsApiEnabled(),
  });
}

export function useBusinessProfileQuery() {
  return useQuery({
    queryKey: ledgerQueryKeys.businessProfile,
    queryFn: () => businessProfileApi.get(),
    enabled: businessProfileApiEnabled(),
  });
}

export function usePaymentsQuery() {
  return useQuery({
    queryKey: ledgerQueryKeys.payments,
    queryFn: () => paymentsApi.list(),
    enabled: paymentsApiEnabled(),
  });
}

export function useReceiptsQuery() {
  return useQuery({
    queryKey: ledgerQueryKeys.receipts,
    queryFn: () => receiptsApi.list(),
    enabled: receiptsApiEnabled(),
  });
}
