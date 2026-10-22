import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  PublicInvoice: { shareToken: string };
  PublicQuote: { shareToken: string };
};

export type AuthStackParamList = {
  Intro: undefined;
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
  QuoteList: undefined;
  QuoteCreate: { customerId?: string } | undefined;
  QuoteEdit: { quoteId: string };
  QuoteDetail: { quoteId: string };
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

export type ItemStackParamList = {
  ItemList: undefined;
  ItemCreate: undefined;
  ItemEdit: { itemId: string };
  ItemDetail: { itemId: string };
};

export type BankingStackParamList = {
  BankAccountList: undefined;
  BankAccountCreate: undefined;
  BankAccountDetail: { bankAccountId: string };
  BankAccountEdit: { bankAccountId: string };
  BankTransactionCreate: { bankAccountId: string };
  BankTransactionEdit: { bankAccountId: string; transactionId: string };
  BankTransferCreate: { sourceAccountId: string };
  BankStatementImport: { bankAccountId: string };
};

export type SettingsStackParamList = {
  SettingsList: undefined;
  BusinessSettings: undefined;
  Reports: undefined;
};

export type MoreStackParamList = SettingsStackParamList & ExpenseStackParamList & PurchaseStackParamList & ItemStackParamList & BankingStackParamList;

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
  ItemStackParamList &
  BankingStackParamList &
  SettingsStackParamList &
  HomeStackParamList;
