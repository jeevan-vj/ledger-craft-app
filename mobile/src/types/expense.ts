// Expense types for mobile app
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'check' | 'other';
export type AccountType = 'bank' | 'cash' | 'credit_card' | 'loan' | 'custom';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  categoryId?: string | null;
  category?: ExpenseCategory;
  accountId?: string | null;
  account?: Account;
  vendorName?: string | null;
  receiptUrl?: string | null;
  expenseDate: string;
  status: ExpenseStatus;
  isBillable: boolean;
  customerId?: string | null;
  customer?: Customer;
  taxAmount: number;
  currency: string;
  paymentMethod?: PaymentMethod | null;
  notes?: string | null;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

