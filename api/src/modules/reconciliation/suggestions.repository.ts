import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customers } from '../../db/schema/customers';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { bills, vendors } from '../../db/schema/purchases';
import { decimal, roundMoney } from '../invoices/money';

export type SuggestionCandidate = {
  id: string;
  type: 'invoice' | 'bill' | 'expense';
  date: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
  amount: string;
};

export async function listCandidates(
  tx: Database,
  organisationId: string,
  direction: 'debit' | 'credit',
): Promise<SuggestionCandidate[]> {
  if (direction === 'credit') {
    const rows = await tx.select({ invoice: invoices, customerName: customers.name })
      .from(invoices)
      .innerJoin(customers, and(eq(customers.organisationId, organisationId), eq(customers.id, invoices.customerId)))
      .where(eq(invoices.organisationId, organisationId));
    return rows
      .filter(({ invoice }) => invoice.lifecycleStatus === 'active' && invoice.status !== 'draft' && decimal(invoice.balanceDue).compare(0) > 0)
      .map(({ invoice, customerName }) => ({
        id: invoice.id,
        type: 'invoice' as const,
        date: invoice.dueDate || invoice.date,
        description: `Invoice ${invoice.invoiceNumber}`,
        reference: invoice.externalNumber ?? invoice.invoiceNumber,
        counterparty: customerName,
        amount: roundMoney(invoice.balanceDue),
      }));
  }

  const [billRows, expenseRows] = await Promise.all([
    tx.select({ bill: bills, vendorName: vendors.name })
      .from(bills)
      .innerJoin(vendors, and(eq(vendors.organisationId, organisationId), eq(vendors.id, bills.vendorId)))
      .where(eq(bills.organisationId, organisationId)),
    tx.select().from(expenses).where(eq(expenses.organisationId, organisationId)),
  ]);
  return [
    ...billRows
      .filter(({ bill }) => bill.lifecycleStatus === 'received' && decimal(bill.balanceDue).compare(0) > 0)
      .map(({ bill, vendorName }) => ({
        id: bill.id,
        type: 'bill' as const,
        date: bill.dueDate || bill.issueDate,
        description: `Bill ${bill.billNumber}`,
        reference: bill.vendorReference ?? bill.externalNumber ?? bill.billNumber,
        counterparty: vendorName,
        amount: roundMoney(bill.balanceDue),
      })),
    ...expenseRows
      .filter((expense) => expense.status === 'approved')
      .map((expense) => ({
        id: expense.id,
        type: 'expense' as const,
        date: expense.expenseDate,
        description: expense.description,
        reference: expense.vendorName ?? null,
        counterparty: expense.vendorName ?? null,
        amount: roundMoney(expense.amount),
      })),
  ];
}
