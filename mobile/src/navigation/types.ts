import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  Onboarding: undefined;
};

export type HomeStackParamList = {
  DashboardHome: undefined;
};

export type CustomerStackParamList = {
  CustomerList: undefined;
  CustomerCreate: undefined;
  CustomerDetail: { customerId: string };
  CustomerEdit: { customerId: string };
};

export type InvoiceStackParamList = {
  InvoiceList: undefined;
  InvoiceCreate: { customerId?: string } | undefined;
  InvoiceEdit: { invoiceId: string };
  InvoiceDetail: { invoiceId: string };
  /** Contextual detour so Back returns to the invoice instead of the More tab. */
  BusinessSettings: undefined;
};

export type ExpenseStackParamList = {
  ExpenseList: undefined;
  ExpenseCreate: undefined;
  ExpenseEdit: { expenseId: string };
};

export type PurchaseStackParamList = {
  PurchaseList: undefined;
  BillCreate: undefined;
  BillEdit: { billId: string };
  BillDetail: { billId: string };
};

export type SettingsStackParamList = {
  SettingsList: undefined;
  BusinessSettings: undefined;
};

export type MoreStackParamList = SettingsStackParamList & ExpenseStackParamList & PurchaseStackParamList;

export type MainTabParamList = {
  Dashboard: NavigatorScreenParams<HomeStackParamList>;
  Invoices: NavigatorScreenParams<InvoiceStackParamList>;
  Customers: NavigatorScreenParams<CustomerStackParamList>;
  More: NavigatorScreenParams<MoreStackParamList>;
};

/** @deprecated Use nested stack param lists. Kept for existing screen imports. */
export type AppTabParamList = InvoiceStackParamList &
  ExpenseStackParamList &
  PurchaseStackParamList &
  SettingsStackParamList &
  HomeStackParamList;
