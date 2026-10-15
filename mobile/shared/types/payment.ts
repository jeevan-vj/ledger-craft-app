// Payment & Accounting System Types
import { Invoice, Customer, BusinessProfile, Account } from './index';

export interface Payment {
  id: string;
  invoiceId: string;
  userId: string;
  paymentMethod: 'bank_transfer' | 'cash' | 'cheque' | 'credit_card' | 'online';
  amount: number;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  paymentId: string;
  receiptNumber: string;
  userId: string;
  generatedAt: string;
  emailSentAt?: string;
  isEmailed: boolean;
  receiptData?: ReceiptData;
  createdAt: string;
}

export interface ReceiptData {
  payment: Payment;
  invoice: Invoice;
  customer: Customer;
  business: BusinessProfile;
  receiptNumber: string;
  paymentDate: string;
  amountPaid: number;
  paymentMethod: string;
  balanceAfterPayment: number;
  taxBreakdown?: TaxBreakdown;
}

export interface TaxConfiguration {
  id: string;
  userId: string;
  countryCode: string;
  taxType: 'GST' | 'VAT' | 'Sales_Tax';
  taxRate: number; // e.g., 0.15 for 15%
  taxName: string;
  appliesToServices: boolean;
  appliesToGoods: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaxBreakdown {
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  taxName: string;
  taxInclusive: boolean;
  total: number;
}

export interface EnhancedInvoice extends Invoice {
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  totalPaid: number;
  balanceDue: number;
  taxInclusive: boolean;
  taxBreakdown?: TaxBreakdown;
  payments?: Payment[];
}

export interface JournalEntry {
  id: string;
  userId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  referenceType?: 'invoice' | 'payment' | 'expense' | 'manual';
  referenceId?: string;
  totalAmount: number;
  status: 'draft' | 'posted' | 'reversed';
  lines: JournalEntryLine[];
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  account?: EnhancedAccount;
  description?: string;
  debitAmount: number;
  creditAmount: number;
  lineOrder: number;
  createdAt: string;
}

export interface EnhancedAccount extends Account {
  accountNumber?: string;
  accountClass?: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  parentAccountId?: string;
  childAccounts?: EnhancedAccount[];
  isActive: boolean;
  description?: string;
  normalBalance?: 'debit' | 'credit';
  calculatedBalance?: number;
}

export interface AccountTemplate {
  id: string;
  name: string;
  accountNumber: string;
  accountClass: string;
  accountType: string;
  normalBalance: 'debit' | 'credit';
  description?: string;
  isSystem: boolean;
  countryCode: string;
  createdAt: string;
}

export interface TaxReturn {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  returnType: 'GST' | 'Income_Tax' | 'PAYE';
  totalSales: number;
  totalPurchases: number;
  gstOnSales: number;
  gstOnPurchases: number;
  netGst: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedAt?: string;
  irdReference?: string;
  returnData?: IRDReturnData;
  createdAt: string;
  updatedAt: string;
}

export interface IRDReturnData {
  // GST Return specific data
  gstReturn?: {
    salesDetails: {
      standardRated: number;
      zeroRated: number;
      exempt: number;
      totalSales: number;
      gstOnSales: number;
    };
    purchaseDetails: {
      standardRated: number;
      capitalGoods: number;
      totalPurchases: number;
      gstOnPurchases: number;
    };
    adjustments?: {
      badDebts: number;
      otherAdjustments: number;
    };
  };
  // Income Tax Return specific data
  incomeTax?: {
    grossIncome: number;
    allowableDeductions: number;
    taxableIncome: number;
    taxDue: number;
    provisionalTax: number;
  };
}

// Calculation utilities types
export interface TaxCalculationResult {
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  taxName: string;
  breakdown: {
    lineItems: Array<{
      description: string;
      amount: number;
      taxable: boolean;
      taxAmount: number;
    }>;
  };
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amountAllocated: number;
  remainingBalance: number;
}

export interface PaymentProcessingResult {
  success: boolean;
  payment?: Payment;
  receipt?: Receipt;
  journalEntry?: JournalEntry;
  errors?: string[];
  warnings?: string[];
}

// Financial reporting types
export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  totalReceivables: number;
  totalPayables: number;
  cashPosition: number;
  gstLiability: number;
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface AccountBalanceSummary {
  accountId: string;
  accountName: string;
  accountNumber: string;
  accountClass: string;
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  childAccounts?: AccountBalanceSummary[];
}

// API request/response types
export interface CreatePaymentRequest {
  invoiceId: string;
  paymentMethod: Payment['paymentMethod'];
  amount: number;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
  generateReceipt?: boolean;
}

export interface TaxCalculationRequest {
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxable: boolean;
  }>;
  taxInclusive: boolean;
  additionalCharges?: number;
  discounts?: number;
}

export interface GenerateReceiptRequest {
  paymentId: string;
  emailToCustomer?: boolean;
}

export interface IRDReturnRequest {
  periodStart: string;
  periodEnd: string;
  returnType: TaxReturn['returnType'];
  includeTransactionDetails?: boolean;
}

// Validation types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PaymentValidationRules {
  minAmount: number;
  maxAmount: number;
  allowPartialPayments: boolean;
  allowOverpayments: boolean;
  requiredFields: (keyof Payment)[];
}

// Audit and compliance types
export interface AuditTrail {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldData?: Record<string, any>;
  newData?: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}