/**
 * App data facade. When Hono flags are on, list reads come from TanStack Query.
 * CRUD still goes through DataManager (already forked to Hono) and then invalidates Query.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { solidDataManager } from '@/services/DataManagerSOLID';
import { Customer, Invoice, BusinessProfile, Item, ItemCategory, Account, Expense, ExpenseCategory } from "@/types";
import { Payment, Receipt, CreatePaymentRequest } from "@/types/payment";
import { honoAppDataEnabled } from '@/features/ledger/api/ledgerSnapshot';
import { useCustomersQuery } from '@/features/customers/hooks/useCustomers';
import {
  ledgerQueryKeys,
  useAccountsQuery,
  useBusinessProfileQuery,
  useExpenseCategoriesQuery,
  useExpensesQuery,
  useInvoicesQuery,
  useItemsQuery,
  usePaymentsQuery,
  useReceiptsQuery,
} from '@/features/app-data/useLedgerQueries';

interface AppData {
  customers: Customer[];
  invoices: Invoice[];
  businessProfile: BusinessProfile | null;
  items: Item[];
  itemCategories: ItemCategory[];
  accounts: Account[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  payments: Payment[];
  receipts: Receipt[];
  units: string[];
}

interface AppLoading {
  customers: boolean;
  invoices: boolean;
  businessProfile: boolean;
  items: boolean;
  itemCategories: boolean;
  accounts: boolean;
  expenses: boolean;
  expenseCategories: boolean;
  payments: boolean;
  receipts: boolean;
}

export const useAppData = () => {
  const queryClient = useQueryClient();
  const hono = honoAppDataEnabled();
  const customersQuery = useCustomersQuery();
  const invoicesQuery = useInvoicesQuery();
  const expensesQuery = useExpensesQuery();
  const expenseCategoriesQuery = useExpenseCategoriesQuery();
  const itemsQuery = useItemsQuery();
  const accountsQuery = useAccountsQuery();
  const businessProfileQuery = useBusinessProfileQuery();
  const paymentsQuery = usePaymentsQuery();
  const receiptsQuery = useReceiptsQuery();

  const [data, setData] = useState<AppData>(() => solidDataManager.getData());
  const [loading, setLoading] = useState<AppLoading>(() => solidDataManager.getLoading());

  useEffect(() => {
    const unsubscribe = solidDataManager.subscribe((newData, newLoading) => {
      setData(newData);
      setLoading(newLoading);
    });

    return unsubscribe;
  }, []);

  const invalidate = useCallback(
    async (...keys: Array<readonly unknown[]>) => {
      if (!honoAppDataEnabled()) return;
      await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    },
    [queryClient],
  );

  const refresh = {
    customers: () =>
      hono ? customersQuery.refetch().then(() => undefined) : solidDataManager.fetchCustomers(),
    invoices: () =>
      hono ? invoicesQuery.refetch().then(() => undefined) : solidDataManager.fetchInvoices(),
    businessProfile: () =>
      hono ? businessProfileQuery.refetch().then(() => undefined) : solidDataManager.fetchBusinessProfile(),
    items: () => (hono ? itemsQuery.refetch().then(() => undefined) : solidDataManager.fetchItems()),
    itemCategories: () =>
      hono ? itemsQuery.refetch().then(() => undefined) : solidDataManager.fetchItemCategories(),
    accounts: () =>
      hono ? accountsQuery.refetch().then(() => undefined) : solidDataManager.fetchAccounts(),
    expenses: () =>
      hono ? expensesQuery.refetch().then(() => undefined) : solidDataManager.fetchExpenses(),
    expenseCategories: () =>
      hono
        ? expenseCategoriesQuery.refetch().then(() => undefined)
        : solidDataManager.fetchExpenseCategories(),
    payments: () =>
      hono ? paymentsQuery.refetch().then(() => undefined) : solidDataManager.fetchPayments(),
    receipts: () =>
      hono ? receiptsQuery.refetch().then(() => undefined) : solidDataManager.fetchReceipts(),
  };

  const createInvoice = useCallback(async (invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">) => {
    const result = await solidDataManager.createInvoice(invoice);
    await invalidate(ledgerQueryKeys.invoices, ledgerQueryKeys.payments);
    return result;
  }, [invalidate]);
  
  const updateInvoice = useCallback(async (invoice: Invoice) => {
    const result = await solidDataManager.updateInvoice(invoice);
    await invalidate(ledgerQueryKeys.invoices);
    return result;
  }, [invalidate]);
  
  const deleteInvoice = useCallback(async (id: string) => {
    await solidDataManager.deleteInvoice(id);
    await invalidate(ledgerQueryKeys.invoices, ledgerQueryKeys.payments);
  }, [invalidate]);
  
  const getInvoice = useCallback((id: string) => 
    solidDataManager.getInvoice(id), []);
  
  const getNextInvoiceNumber = useCallback(() => 
    solidDataManager.getNextInvoiceNumber(), []);
  
  const updateInvoiceStatus = useCallback(async (id: string, status: Invoice['status']) => {
    const result = await solidDataManager.updateInvoiceStatus(id, status);
    await invalidate(ledgerQueryKeys.invoices);
    return result;
  }, [invalidate]);
  
  const createCustomer = useCallback(async (customer: Omit<Customer, "id" | "createdAt" | "updatedAt">) => {
    const result = await solidDataManager.createCustomer(customer);
    await invalidate(ledgerQueryKeys.customers);
    return result;
  }, [invalidate]);
  
  const updateCustomer = useCallback(async (id: string, customer: Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>) => {
    const result = await solidDataManager.updateCustomer(id, customer);
    await invalidate(ledgerQueryKeys.customers);
    return result;
  }, [invalidate]);
  
  const deleteCustomer = useCallback(async (id: string) => {
    await solidDataManager.deleteCustomer(id);
    await invalidate(ledgerQueryKeys.customers);
  }, [invalidate]);
  
  const getCustomer = useCallback((id: string) => 
    solidDataManager.getCustomer(id), []);
  
  const saveBusinessProfile = useCallback(async (profile: Omit<BusinessProfile, "id" | "createdAt" | "updatedAt">) => {
    const result = await solidDataManager.saveBusinessProfile(profile);
    await invalidate(ledgerQueryKeys.businessProfile);
    return result;
  }, [invalidate]);
  
  const updateBusinessProfile = useCallback(async (profile: BusinessProfile) => {
    const result = await solidDataManager.updateBusinessProfile(profile);
    await invalidate(ledgerQueryKeys.businessProfile);
    return result;
  }, [invalidate]);
  
  const createPayment = useCallback(async (payment: CreatePaymentRequest) => {
    const result = await solidDataManager.createPayment(payment);
    await invalidate(ledgerQueryKeys.payments, ledgerQueryKeys.invoices, ledgerQueryKeys.receipts);
    return result;
  }, [invalidate]);
  
  const getInvoicesWithBalance = useCallback(() => 
    solidDataManager.getInvoicesWithBalance(), []);

  const createItem = useCallback(async (item: Omit<Item, "id" | "createdAt" | "updatedAt" | "category">) => {
    const result = await solidDataManager.createItem(item);
    await invalidate(ledgerQueryKeys.items);
    return result;
  }, [invalidate]);
  
  const updateItem = useCallback(async (id: string, item: Partial<Omit<Item, "id" | "createdAt" | "updatedAt" | "category">>) => {
    const result = await solidDataManager.updateItem(id, item);
    await invalidate(ledgerQueryKeys.items);
    return result;
  }, [invalidate]);
  
  const deleteItem = useCallback(async (id: string) => {
    await solidDataManager.deleteItem(id);
    await invalidate(ledgerQueryKeys.items);
  }, [invalidate]);
  
  const getItem = useCallback((id: string) => 
    solidDataManager.getItem(id), []);

  const createItemCategory = useCallback(async (category: Omit<ItemCategory, "id" | "createdAt" | "updatedAt">) => {
    const result = await solidDataManager.createItemCategory(category);
    await invalidate(ledgerQueryKeys.items);
    return result;
  }, [invalidate]);
  
  const updateItemCategory = useCallback(async (id: string, category: Partial<Omit<ItemCategory, "id" | "createdAt" | "updatedAt">>) => {
    const result = await solidDataManager.updateItemCategory(id, category);
    await invalidate(ledgerQueryKeys.items);
    return result;
  }, [invalidate]);
  
  const deleteItemCategory = useCallback(async (id: string) => {
    await solidDataManager.deleteItemCategory(id);
    await invalidate(ledgerQueryKeys.items);
  }, [invalidate]);
  
  const getItemCategory = useCallback((id: string) => 
    solidDataManager.getItemCategory(id), []);

  const createExpense = useCallback(async (expense: Omit<Expense, "id" | "createdAt" | "updatedAt" | "category" | "account" | "customer">) => {
    const result = await solidDataManager.createExpense(expense);
    await invalidate(ledgerQueryKeys.expenses);
    return result;
  }, [invalidate]);
  
  const updateExpense = useCallback(async (id: string, expense: Partial<Omit<Expense, "id" | "createdAt" | "updatedAt" | "category" | "account" | "customer">>) => {
    const result = await solidDataManager.updateExpense(id, expense);
    await invalidate(ledgerQueryKeys.expenses);
    return result;
  }, [invalidate]);
  
  const deleteExpense = useCallback(async (id: string) => {
    await solidDataManager.deleteExpense(id);
    await invalidate(ledgerQueryKeys.expenses);
  }, [invalidate]);
  
  const getExpense = useCallback((id: string) => 
    solidDataManager.getExpense(id), []);

  const createExpenseCategory = useCallback(async (category: Omit<ExpenseCategory, "id" | "createdAt" | "updatedAt">) => {
    const result = await solidDataManager.createExpenseCategory(category);
    await invalidate(ledgerQueryKeys.expenseCategories, ledgerQueryKeys.expenses);
    return result;
  }, [invalidate]);
  
  const updateExpenseCategory = useCallback(async (id: string, category: Partial<Omit<ExpenseCategory, "id" | "createdAt" | "updatedAt">>) => {
    const result = await solidDataManager.updateExpenseCategory(id, category);
    await invalidate(ledgerQueryKeys.expenseCategories, ledgerQueryKeys.expenses);
    return result;
  }, [invalidate]);
  
  const deleteExpenseCategory = useCallback(async (id: string) => {
    await solidDataManager.deleteExpenseCategory(id);
    await invalidate(ledgerQueryKeys.expenseCategories, ledgerQueryKeys.expenses);
  }, [invalidate]);
  
  const getExpenseCategory = useCallback((id: string) => 
    solidDataManager.getExpenseCategory(id), []);

  return {
    customers: hono ? (customersQuery.data ?? []) : data.customers,
    invoices: hono ? (invoicesQuery.data ?? []) : data.invoices,
    businessProfile: hono ? (businessProfileQuery.data ?? null) : data.businessProfile,
    items: hono ? (itemsQuery.data?.items ?? []) : data.items,
    itemCategories: hono ? (itemsQuery.data?.categories ?? []) : data.itemCategories,
    accounts: hono ? (accountsQuery.data ?? []) : data.accounts,
    expenses: hono ? (expensesQuery.data ?? []) : data.expenses,
    expenseCategories: hono ? (expenseCategoriesQuery.data ?? []) : data.expenseCategories,
    payments: hono ? (paymentsQuery.data ?? []) : data.payments,
    receipts: hono ? (receiptsQuery.data ?? []) : data.receipts,
    units: data.units,
    
    isLoadingCustomers: hono ? customersQuery.isLoading : loading.customers,
    isLoadingInvoices: hono ? invoicesQuery.isLoading : loading.invoices,
    isLoadingBusinessProfile: hono ? businessProfileQuery.isLoading : loading.businessProfile,
    isLoadingItems: hono ? itemsQuery.isLoading : loading.items,
    isLoadingItemCategories: hono ? itemsQuery.isLoading : loading.itemCategories,
    isLoadingAccounts: hono ? accountsQuery.isLoading : loading.accounts,
    isLoadingExpenses: hono ? expensesQuery.isLoading : loading.expenses,
    isLoadingExpenseCategories: hono ? expenseCategoriesQuery.isLoading : loading.expenseCategories,
    isLoadingPayments: hono ? paymentsQuery.isLoading : loading.payments,
    isLoadingReceipts: hono ? receiptsQuery.isLoading : loading.receipts,
    
    refreshCustomers: refresh.customers,
    refreshInvoices: refresh.invoices,
    refreshBusinessProfile: refresh.businessProfile,
    refreshItems: refresh.items,
    refreshItemCategories: refresh.itemCategories,
    refreshAccounts: refresh.accounts,
    refreshExpenses: refresh.expenses,
    refreshExpenseCategories: refresh.expenseCategories,
    refreshPayments: refresh.payments,
    refreshReceipts: refresh.receipts,
    
    createInvoice,
    updateInvoice,
    deleteInvoice,
    getInvoice,
    getNextInvoiceNumber,
    updateInvoiceStatus,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomer,
    saveBusinessProfile,
    updateBusinessProfile,
    createPayment,
    getInvoicesWithBalance,
    createItem,
    updateItem,
    deleteItem,
    getItem,
    createItemCategory,
    updateItemCategory,
    deleteItemCategory,
    getItemCategory,
    createExpense,
    updateExpense,
    deleteExpense,
    getExpense,
    createExpenseCategory,
    updateExpenseCategory,
    deleteExpenseCategory,
    getExpenseCategory,
  };
};
