import type { Expense, Invoice } from '@/types';
import type { EnhancedInvoice } from '@/types/payment';

export type PeriodInvoice = EnhancedInvoice & {
  tax_amount: number;
};

export type PeriodExpense = Expense & {
  tax_amount: number;
  is_claimable: boolean;
  is_capital_expense: boolean;
  expense_date: string;
  date: string;
  category_id?: string;
  vendor_name?: string | null;
  gstAmount: number;
};

export function readMoney(row: unknown, ...keys: string[]): number {
  if (!row || typeof row !== 'object') return 0;
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value == null || value === '') continue;
    const amount = Number(value);
    if (!Number.isNaN(amount)) return amount;
  }
  return 0;
}

export function readString(row: unknown, ...keys: string[]): string {
  if (!row || typeof row !== 'object') return '';
  const record = row as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

export function toPeriodInvoice(invoice: Invoice): PeriodInvoice {
  const taxAmount = readMoney(invoice, 'taxAmount', 'tax_amount');
  const paymentStatus: PeriodInvoice['paymentStatus'] =
    invoice.status === 'paid' ? 'paid' : invoice.status === 'overdue' ? 'overdue' : 'unpaid';
  return {
    ...invoice,
    taxInclusive: true,
    paymentStatus,
    totalPaid: invoice.status === 'paid' ? invoice.total : 0,
    balanceDue: invoice.status === 'paid' ? 0 : invoice.total,
    taxAmount,
    tax_amount: taxAmount,
  };
}

export function toPeriodExpense(expense: Expense): PeriodExpense {
  const taxAmount = readMoney(expense, 'taxAmount', 'tax_amount');
  const expenseDate = readString(expense, 'expenseDate', 'expense_date', 'date');
  return {
    ...expense,
    amount: readMoney(expense, 'amount'),
    taxAmount,
    tax_amount: taxAmount,
    is_claimable: true,
    is_capital_expense: false,
    expense_date: expenseDate,
    date: expenseDate,
    category_id: expense.categoryId,
    vendor_name: expense.vendorName ?? null,
    gstAmount: taxAmount,
  };
}

export function summarizeGst(
  invoices: unknown[],
  expenses: unknown[],
): {
  totalSales: number;
  totalPurchases: number;
  gstOnSales: number;
  gstOnPurchases: number;
  netGstPosition: number;
} {
  const totalSales = invoices.reduce((sum, invoice) => sum + readMoney(invoice, 'total'), 0);
  const gstOnSales = invoices.reduce(
    (sum, invoice) => sum + readMoney(invoice, 'taxAmount', 'tax_amount'),
    0,
  );
  const totalPurchases = expenses.reduce((sum, expense) => sum + readMoney(expense, 'amount'), 0);
  const gstOnPurchases = expenses
    .filter((expense) => {
      if (!expense || typeof expense !== 'object') return false;
      const row = expense as Record<string, unknown>;
      return row.is_claimable !== false && row.isGstClaimable !== false;
    })
    .reduce((sum, expense) => sum + readMoney(expense, 'taxAmount', 'tax_amount'), 0);

  return {
    totalSales,
    totalPurchases,
    gstOnSales,
    gstOnPurchases,
    netGstPosition: gstOnSales - gstOnPurchases,
  };
}
