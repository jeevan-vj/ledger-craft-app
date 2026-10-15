// Bank Transaction Import Types

export interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  accountType: 'checking' | 'savings' | 'credit_card' | 'business';
  currency: string;
  openingBalance: number;
  currentBalance: number;
  isActive: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupabaseBankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  account_type: 'checking' | 'savings' | 'credit_card' | 'business';
  currency: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  description: string;
  reference?: string;
  amount: number;
  type: 'debit' | 'credit';
  balance?: number;
  category?: string;
  merchant?: string;
  isReconciled: boolean;
  notes?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupabaseBankTransaction {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string;
  reference: string | null;
  amount: number;
  type: 'debit' | 'credit';
  balance: number | null;
  category: string | null;
  merchant: string | null;
  is_reconciled: boolean;
  notes: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ImportedTransaction {
  date: string;
  description: string;
  reference?: string;
  amount: number;
  type: 'debit' | 'credit';
  balance?: number;
  category?: string;
  merchant?: string;
}

export interface TransactionImportResult {
  success: boolean;
  importedCount: number;
  duplicatesSkipped: number;
  errors: string[];
  transactions: BankTransaction[];
}

export interface CSVColumnMapping {
  date: string;
  description: string;
  amount: string;
  type?: string;
  balance?: string;
  reference?: string;
  merchant?: string;
}

export interface TransactionImportConfig {
  bankAccountId: string;
  fileType: 'csv' | 'pdf';
  csvMapping?: CSVColumnMapping;
  skipDuplicates: boolean;
  dateFormat?: string;
}

// Account Contact Types for Tax/IRD purposes
export interface AccountContact {
  id: string;
  name: string;
  type: 'tax_agent' | 'accountant' | 'bookkeeper' | 'ird_officer' | 'bank_manager' | 'other';
  organization?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupabaseAccountContact {
  id: string;
  name: string;
  type: 'tax_agent' | 'accountant' | 'bookkeeper' | 'ird_officer' | 'bank_manager' | 'other';
  organization: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Validation types
export interface TransactionValidationRule {
  field: keyof ImportedTransaction;
  required: boolean;
  format?: RegExp;
  minValue?: number;
  maxValue?: number;
}

export interface ImportValidationResult {
  isValid: boolean;
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
  warnings: Array<{
    row: number;
    field: string;
    message: string;
  }>;
}