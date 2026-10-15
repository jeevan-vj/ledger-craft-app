import { describe, expect, it } from 'vitest';
import type { Expense, Invoice } from '@/types';
import {
  readMoney,
  summarizeGst,
  toPeriodExpense,
  toPeriodInvoice,
} from './periodRows';

const invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-1',
  customerId: 'cust-1',
  date: '2026-03-10',
  dueDate: '2026-04-10',
  items: [],
  subtotal: 100,
  taxAmount: 15,
  total: 115,
  status: 'paid',
  currency: 'NZD',
} as Invoice;

const expense = {
  id: 'exp-1',
  description: 'Fuel',
  amount: 46,
  taxAmount: 6,
  currency: 'NZD',
  expenseDate: '2026-03-12',
  status: 'approved',
  isBillable: false,
  categoryId: 'cat-1',
  vendorName: 'BP',
} as Expense;

describe('periodRows', () => {
  it('reads GST money from camelCase or snake_case', () => {
    expect(readMoney(invoice, 'taxAmount', 'tax_amount')).toBe(15);
    expect(readMoney({ tax_amount: 8 }, 'taxAmount', 'tax_amount')).toBe(8);
    expect(readMoney({}, 'taxAmount', 'tax_amount')).toBe(0);
  });

  it('aliases Hono invoices so GST summaries can use tax_amount', () => {
    const row = toPeriodInvoice(invoice);
    expect(row.taxAmount).toBe(15);
    expect(row.tax_amount).toBe(15);
    expect(row.total).toBe(115);
  });

  it('aliases Hono expenses for GST widgets and IRD period fetches', () => {
    const row = toPeriodExpense(expense);
    expect(row.tax_amount).toBe(6);
    expect(row.expense_date).toBe('2026-03-12');
    expect(row.date).toBe('2026-03-12');
    expect(row.category_id).toBe('cat-1');
    expect(row.vendor_name).toBe('BP');
    expect(row.is_claimable).toBe(true);
    expect(row.gstAmount).toBe(6);
  });

  it('summarizes GST from Hono camelCase rows', () => {
    const summary = summarizeGst([toPeriodInvoice(invoice)], [toPeriodExpense(expense)]);
    expect(summary.totalSales).toBe(115);
    expect(summary.gstOnSales).toBe(15);
    expect(summary.totalPurchases).toBe(46);
    expect(summary.gstOnPurchases).toBe(6);
    expect(summary.netGstPosition).toBe(9);
  });
});
