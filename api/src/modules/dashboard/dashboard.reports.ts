import {
  reportResultSchema,
  type DashboardWidgetKind,
  type ReportFilters,
  type ReportResultDto,
} from '@ledgercraft/contracts';
import { and, eq, gte, lte, ne } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { bankAccounts, bankTransactions } from '../../db/schema/bank';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { bills } from '../../db/schema/purchases';
import { decimal } from '../invoices/money';

const authority = {
  status: 'provisional' as const,
  dependency: 'AKP-05' as const,
  message: 'Operational source data. Ledger-authoritative reporting and closed-period accounting depend on AKP-05.',
};

type Range = { from: string; to: string };

function comparisonRange(filters: ReportFilters): Range | null {
  if (filters.comparison === 'none') return null;
  if (filters.comparison === 'previous_year') {
    return { from: `${Number(filters.from.slice(0, 4)) - 1}${filters.from.slice(4)}`, to: `${Number(filters.to.slice(0, 4)) - 1}${filters.to.slice(4)}` };
  }
  const from = new Date(`${filters.from}T00:00:00Z`);
  const to = new Date(`${filters.to}T00:00:00Z`);
  const duration = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(from.getTime() - 86_400_000);
  const previousFrom = new Date(previousTo.getTime() - (duration - 1) * 86_400_000);
  return { from: previousFrom.toISOString().slice(0, 10), to: previousTo.toISOString().slice(0, 10) };
}

function metric(key: string, label: string, value: string, comparisonValue: string | null) {
  return { key, label, value, comparisonValue, currency: 'NZD' };
}

function sum(values: Array<string | null | undefined>) {
  return values.reduce((total, value) => total.add(decimal(value)), decimal(0)).toFixed();
}

async function reportForRange(tx: Database, organisationId: string, type: DashboardWidgetKind, range: Range) {
  if (type === 'receivables') {
    const rows = await tx.select().from(invoices).where(and(
      eq(invoices.organisationId, organisationId), gte(invoices.date, range.from), lte(invoices.date, range.to),
      ne(invoices.status, 'draft'), ne(invoices.paymentStatus, 'cancelled'),
    ));
    return {
      values: [sum(rows.map((row) => row.balanceDue))],
      rows: rows.filter((row) => decimal(row.balanceDue).compare(0) > 0).map((row) => ({
        id: row.id, date: row.date, label: row.invoiceNumber, detail: row.dueDate, value: decimal(row.balanceDue).toFixed(), route: `/invoices/${row.id}`,
      })),
    };
  }
  if (type === 'payables') {
    const rows = await tx.select().from(bills).where(and(
      eq(bills.organisationId, organisationId), gte(bills.issueDate, range.from), lte(bills.issueDate, range.to),
      eq(bills.lifecycleStatus, 'received'),
    ));
    return {
      values: [sum(rows.map((row) => row.balanceDue))],
      rows: rows.filter((row) => decimal(row.balanceDue).compare(0) > 0).map((row) => ({
        id: row.id, date: row.issueDate, label: row.billNumber, detail: row.dueDate, value: decimal(row.balanceDue).toFixed(), route: '/bills',
      })),
    };
  }
  if (type === 'cash') {
    const [transactions, accounts] = await Promise.all([
      tx.select().from(bankTransactions).where(and(eq(bankTransactions.organisationId, organisationId), gte(bankTransactions.transactionDate, range.from), lte(bankTransactions.transactionDate, range.to))),
      tx.select().from(bankAccounts).where(and(eq(bankAccounts.organisationId, organisationId), eq(bankAccounts.isActive, true))),
    ]);
    const inflow = sum(transactions.filter((row) => row.type === 'credit').map((row) => row.amount));
    const outflow = sum(transactions.filter((row) => row.type === 'debit').map((row) => row.amount));
    return {
      values: [inflow, outflow, decimal(inflow).sub(outflow).toFixed(), sum(accounts.map((row) => row.currentBalance))],
      rows: transactions.map((row) => ({
        id: row.id, date: row.transactionDate, label: row.description, detail: row.type, value: `${row.type === 'debit' ? '-' : ''}${decimal(row.amount).toFixed()}`, route: '/bank-accounts',
      })),
    };
  }
  if (type === 'tax') {
    const [sales, purchases] = await Promise.all([
      tx.select().from(invoices).where(and(eq(invoices.organisationId, organisationId), gte(invoices.date, range.from), lte(invoices.date, range.to), ne(invoices.status, 'draft'))),
      tx.select().from(expenses).where(and(eq(expenses.organisationId, organisationId), gte(expenses.expenseDate, range.from), lte(expenses.expenseDate, range.to), ne(expenses.status, 'rejected'))),
    ]);
    const output = sum(sales.map((row) => row.taxAmount));
    const input = sum(purchases.map((row) => row.taxAmount));
    return { values: [output, input, decimal(output).sub(input).toFixed()], rows: [] };
  }
  if (type === 'summary') {
    const [sales, costs] = await Promise.all([
      tx.select().from(invoices).where(and(eq(invoices.organisationId, organisationId), gte(invoices.date, range.from), lte(invoices.date, range.to), ne(invoices.status, 'draft'), ne(invoices.paymentStatus, 'cancelled'))),
      tx.select().from(expenses).where(and(eq(expenses.organisationId, organisationId), gte(expenses.expenseDate, range.from), lte(expenses.expenseDate, range.to), ne(expenses.status, 'rejected'))),
    ]);
    const income = sum(sales.map((row) => row.total));
    const expense = sum(costs.map((row) => row.amount));
    return { values: [income, expense, decimal(income).sub(expense).toFixed()], rows: [] };
  }
  const [invoiceRows, billRows, expenseRows, bankRows] = await Promise.all([
    tx.select().from(invoices).where(and(eq(invoices.organisationId, organisationId), gte(invoices.date, range.from), lte(invoices.date, range.to))),
    tx.select().from(bills).where(and(eq(bills.organisationId, organisationId), gte(bills.issueDate, range.from), lte(bills.issueDate, range.to))),
    tx.select().from(expenses).where(and(eq(expenses.organisationId, organisationId), gte(expenses.expenseDate, range.from), lte(expenses.expenseDate, range.to))),
    tx.select().from(bankTransactions).where(and(eq(bankTransactions.organisationId, organisationId), gte(bankTransactions.transactionDate, range.from), lte(bankTransactions.transactionDate, range.to))),
  ]);
  const rows = [
    ...invoiceRows.map((row) => ({ id: row.id, date: row.date, label: row.invoiceNumber, detail: 'Invoice', value: decimal(row.total).toFixed(), route: `/invoices/${row.id}` })),
    ...billRows.map((row) => ({ id: row.id, date: row.issueDate, label: row.billNumber, detail: 'Bill', value: decimal(row.total).mul(-1).toFixed(), route: '/bills' })),
    ...expenseRows.map((row) => ({ id: row.id, date: row.expenseDate, label: row.description, detail: 'Expense', value: decimal(row.amount).mul(-1).toFixed(), route: '/expenses' })),
    ...bankRows.map((row) => ({ id: row.id, date: row.transactionDate, label: row.description, detail: 'Bank transaction', value: decimal(row.amount).mul(row.type === 'debit' ? -1 : 1).toFixed(), route: '/bank-accounts' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  return { values: [decimal(rows.length).toFixed()], rows };
}

const labels: Record<DashboardWidgetKind, string[]> = {
  summary: ['Income', 'Expenses', 'Operational result'],
  receivables: ['Outstanding receivables'],
  payables: ['Outstanding payables'],
  cash: ['Cash in', 'Cash out', 'Net cash movement', 'Account balance'],
  tax: ['Output tax', 'Input tax', 'Estimated net tax'],
  activity: ['Activity count'],
};

export async function buildReport(tx: Database, organisationId: string, type: DashboardWidgetKind, filters: ReportFilters): Promise<ReportResultDto> {
  const [current, comparison] = await Promise.all([
    reportForRange(tx, organisationId, type, filters),
    comparisonRange(filters) ? reportForRange(tx, organisationId, type, comparisonRange(filters)!) : Promise.resolve(null),
  ]);
  return reportResultSchema.parse({
    type,
    filters,
    authority,
    metrics: current.values.map((value, index) => metric(`${type}-${index}`, labels[type][index]!, value, comparison?.values[index] ?? null)),
    rows: current.rows,
  });
}
