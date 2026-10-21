import type { LinkingOptions } from '@react-navigation/native';
import type { CustomerStackParamList, InvoiceStackParamList, MoreStackParamList, RootStackParamList } from './types';

export const mobileLinking: LinkingOptions<RootStackParamList> = {
  prefixes: ['https://easybiz.iamjeevan.com', 'easybizinvoice://'],
  config: {
    screens: {
      PublicInvoice: 'shared/invoice/:shareToken',
    },
  },
};

/** Home, invoices, customers, then everything else. Customers stay a tab. */
export const mainTabs = ['Dashboard', 'Invoices', 'Customers', 'More'] as const;

export const moreMenuSections = [
  {
    title: 'Sales',
    rows: [
      {
        label: 'Items',
        subtitle: 'Products, services and prices',
        screen: 'ItemList',
      },
    ],
  },
  {
    title: 'Banking',
    rows: [
      {
        label: 'Bank accounts',
        subtitle: 'Balances and imported transactions',
        screen: 'BankAccountList',
      },
    ],
  },
  {
    title: 'Account',
    rows: [
      {
        label: 'Business profile',
        subtitle: 'Details, GST and invoice numbering',
        screen: 'BusinessSettings',
      },
    ],
  },
  {
    title: 'Money out',
    rows: [
      {
        label: 'Expenses',
        subtitle: 'Track purchases and receipts',
        screen: 'ExpenseList',
      },
      {
        label: 'Purchases',
        subtitle: 'Vendors, bills and payments',
        screen: 'PurchaseList',
      },
    ],
  },
] as const;

export type MoreMenuScreen = (typeof moreMenuSections)[number]['rows'][number]['screen'];

type InvoiceDestination =
  | { name: 'InvoiceList' }
  | { name: 'InvoiceCreate' }
  | { name: 'InvoiceDetail'; params: { invoiceId: string } };

type CustomerDestination =
  | { name: 'CustomerList' }
  | { name: 'CustomerCreate' }
  | { name: 'CustomerDetail'; params: { customerId: string } };

type MoreDestination =
  | { name: 'BusinessSettings' }
  | { name: 'ItemList' }
  | { name: 'BankAccountList' }
  | { name: 'ExpenseList' }
  | { name: 'PurchaseList' }
  | { name: 'ExpenseCreate' };

export type NestedRoute = {
  name: keyof CustomerStackParamList | keyof InvoiceStackParamList | keyof MoreStackParamList;
  params?: Record<string, unknown>;
};

export type NestedStackState = {
  index: number;
  routes: NestedRoute[];
};

/**
 * Puts the list under the destination so Back returns to it.
 * Cross-tab `navigate` otherwise lands on a screen with nowhere to go back to.
 */
export function stackAbove(
  rootName: NestedRoute['name'],
  destination: { name: NestedRoute['name']; params?: Record<string, unknown> },
): NestedStackState {
  if (destination.name === rootName) {
    return { index: 0, routes: [{ name: rootName }] };
  }
  const route: NestedRoute = destination.params
    ? { name: destination.name, params: destination.params }
    : { name: destination.name };
  return { index: 1, routes: [{ name: rootName }, route] };
}

export function invoiceTabParams(destination: InvoiceDestination): { state: NestedStackState } {
  return {
    state: stackAbove(
      'InvoiceList',
      destination.name === 'InvoiceDetail'
        ? { name: destination.name, params: destination.params }
        : { name: destination.name },
    ),
  };
}

export function customerTabParams(destination: CustomerDestination): { state: NestedStackState } {
  return {
    state: stackAbove(
      'CustomerList',
      destination.name === 'CustomerDetail'
        ? { name: destination.name, params: destination.params }
        : { name: destination.name },
    ),
  };
}

export function moreTabParams(destination: MoreDestination): { state: NestedStackState } {
  return { state: stackAbove('SettingsList', destination) };
}

export type HomeQuickActionId = 'newInvoice' | 'recordPayment' | 'addExpense' | 'addCustomer';

export type HomeQuickActionLink = {
  tab: 'Invoices' | 'Customers' | 'More';
  params: { state: NestedStackState };
};

/**
 * Home tiles. Record payment opens the invoice list because payment capture
 * starts there: marking an invoice paid opens the existing payment modal.
 * There is no standalone record-payment screen.
 */
export function homeQuickActionLink(action: HomeQuickActionId): HomeQuickActionLink {
  switch (action) {
    case 'newInvoice':
      return { tab: 'Invoices', params: invoiceTabParams({ name: 'InvoiceCreate' }) };
    case 'recordPayment':
      return { tab: 'Invoices', params: invoiceTabParams({ name: 'InvoiceList' }) };
    case 'addExpense':
      return { tab: 'More', params: moreTabParams({ name: 'ExpenseCreate' }) };
    case 'addCustomer':
      return { tab: 'Customers', params: customerTabParams({ name: 'CustomerCreate' }) };
  }
}
