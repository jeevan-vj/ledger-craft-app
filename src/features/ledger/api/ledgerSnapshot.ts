import type { Account, BusinessProfile, Customer, Expense, Invoice, Item } from '@/types';
import type { Payment } from '@/types/payment';
import { accountsApi, accountsApiEnabled, paymentsApi, paymentsApiEnabled } from '@/features/payments/api/paymentsApi';
import { businessProfileApi, businessProfileApiEnabled } from '@/features/business-profile/api/businessProfileApi';
import { customersApi, customersApiEnabled } from '@/features/customers/api/customersApi';
import { expensesApi, expensesApiEnabled } from '@/features/expenses/api/expensesApi';
import { invoicesApi, invoicesApiEnabled } from '@/features/invoices/api/invoicesApi';
import { itemsApi, itemsApiEnabled } from '@/features/items/api/itemsApi';

export interface LedgerSnapshot {
  invoices: Invoice[];
  expenses: Expense[];
  customers: Customer[];
  items: Item[];
  profile: BusinessProfile | null;
  payments: Payment[];
  accounts: Account[];
}

export function isoDate(value: string | Date): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

export function inInclusiveDateRange(value: string | undefined, start: string | Date, end: string | Date): boolean {
  if (!value) return false;
  const date = isoDate(value);
  return date >= isoDate(start) && date <= isoDate(end);
}

export function ledgerSnapshotEnabled(): boolean {
  return invoicesApiEnabled() && expensesApiEnabled();
}

export function honoAppDataEnabled(): boolean {
  return (
    customersApiEnabled() &&
    invoicesApiEnabled() &&
    expensesApiEnabled() &&
    paymentsApiEnabled() &&
    itemsApiEnabled() &&
    businessProfileApiEnabled()
  );
}

export async function loadLedgerSnapshot(): Promise<LedgerSnapshot> {
  const [invoices, expenses, customers, itemsResult, profile, payments, accounts] = await Promise.all([
    invoicesApiEnabled() ? invoicesApi.list() : Promise.resolve([] as Invoice[]),
    expensesApiEnabled() ? expensesApi.listExpenses() : Promise.resolve([] as Expense[]),
    customersApiEnabled() ? customersApi.list() : Promise.resolve([] as Customer[]),
    itemsApiEnabled() ? itemsApi.list() : Promise.resolve({ items: [] as Item[], categories: [] }),
    businessProfileApiEnabled() ? businessProfileApi.get() : Promise.resolve(null),
    paymentsApiEnabled() ? paymentsApi.list() : Promise.resolve([] as Payment[]),
    accountsApiEnabled() ? accountsApi.list() : Promise.resolve([] as Account[]),
  ]);

  return {
    invoices,
    expenses,
    customers,
    items: itemsResult.items,
    profile,
    payments,
    accounts,
  };
}
