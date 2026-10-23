import { reportResultSchema, type DashboardWidgetKind, type FinancialReportResponse, type ReportFilters, type ReportResultDto } from '@ledgercraft/contracts';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { bankTransactions } from '../../db/schema/bank';
import { expenses } from '../../db/schema/expenses';
import { invoices } from '../../db/schema/invoices';
import { bills } from '../../db/schema/purchases';
import { decimal } from '../invoices/money';
import { financialReportInTx } from '../reports/reports.service';

const ledgerAuthority = { status: 'authoritative' as const, source: 'posted_ledger' as const, message: 'Calculated by the server from posted journal entries and document balances.' };
const operationalAuthority = { status: 'operational' as const, source: 'operational_records' as const, message: 'Recent source-record activity; this count is not a financial statement.' };
type Range = { from: string; to: string };

function comparisonRange(filters: ReportFilters): Range | null {
  if (filters.comparison === 'none') return null;
  if (filters.comparison === 'previous_year') return { from: `${Number(filters.from.slice(0, 4)) - 1}${filters.from.slice(4)}`, to: `${Number(filters.to.slice(0, 4)) - 1}${filters.to.slice(4)}` };
  const from = new Date(`${filters.from}T00:00:00Z`); const to = new Date(`${filters.to}T00:00:00Z`);
  const duration = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(from.getTime() - 86_400_000); const previousFrom = new Date(previousTo.getTime() - (duration - 1) * 86_400_000);
  return { from: previousFrom.toISOString().slice(0, 10), to: previousTo.toISOString().slice(0, 10) };
}

const metric = (key: string, label: string, value: string, comparisonValue: string | null) => ({ key, label, value, comparisonValue, currency: 'NZD' });

async function activityForRange(tx: Database, organisationId: string, range: Range) {
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
  return { count: decimal(rows.length).toFixed(), rows };
}

function ledgerReport(type: Exclude<DashboardWidgetKind, 'activity'>, filters: ReportFilters, report: FinancialReportResponse, comparison: FinancialReportResponse | null): ReportResultDto {
  const common = { type, filters, authority: ledgerAuthority };
  if (type === 'summary') return reportResultSchema.parse({ ...common, metrics: [metric('summary-revenue', 'Revenue', report.profitLoss.revenue, comparison?.profitLoss.revenue ?? null), metric('summary-expenses', 'Expenses', report.profitLoss.expenses, comparison?.profitLoss.expenses ?? null), metric('summary-net', 'Net income', report.profitLoss.netIncome, comparison?.profitLoss.netIncome ?? null)], rows: report.profitLoss.rows.map((row) => ({ id: row.accountId, date: filters.to, label: row.accountName, detail: row.accountNumber ? `Account ${row.accountNumber}` : 'Ledger account', value: row.balance, route: '/accounting' })) });
  if (type === 'receivables') return reportResultSchema.parse({ ...common, metrics: [metric('receivables-total', 'Outstanding receivables', report.receivablesAging.total, comparison?.receivablesAging.total ?? null)], rows: report.receivablesAging.items.map((row) => ({ id: row.id, date: row.issueDate, label: row.number, detail: `${row.partyName} · due ${row.dueDate}`, value: row.balanceDue, route: `/invoices/${row.id}` })) });
  if (type === 'payables') return reportResultSchema.parse({ ...common, metrics: [metric('payables-total', 'Outstanding payables', report.payablesAging.total, comparison?.payablesAging.total ?? null)], rows: report.payablesAging.items.map((row) => ({ id: row.id, date: row.issueDate, label: row.number, detail: `${row.partyName} · due ${row.dueDate}`, value: row.balanceDue, route: '/bills' })) });
  if (type === 'cash') return reportResultSchema.parse({ ...common, metrics: [metric('cash-in', 'Cash in', report.cashFlow.inflows, comparison?.cashFlow.inflows ?? null), metric('cash-out', 'Cash out', report.cashFlow.outflows, comparison?.cashFlow.outflows ?? null), metric('cash-net', 'Net cash flow', report.cashFlow.netCashFlow, comparison?.cashFlow.netCashFlow ?? null), metric('cash-closing', 'Closing cash', report.cashFlow.closingCash, comparison?.cashFlow.closingCash ?? null)], rows: report.cashFlow.rows.map((row) => ({ id: row.accountId, date: filters.to, label: row.accountName, detail: row.accountNumber ? `Account ${row.accountNumber}` : 'Cash account', value: row.balance, route: '/accounting' })) });
  return reportResultSchema.parse({ ...common, metrics: [metric('tax-collected', 'GST collected', report.taxSummary.collected, comparison?.taxSummary.collected ?? null), metric('tax-paid', 'GST paid', report.taxSummary.paid, comparison?.taxSummary.paid ?? null), metric('tax-net', 'Net GST payable', report.taxSummary.netPayable, comparison?.taxSummary.netPayable ?? null)], rows: [] });
}

export async function buildReports(tx: Database, organisationId: string, filters: ReportFilters): Promise<ReportResultDto[]> {
  const prior = comparisonRange(filters); const query = { from: filters.from, to: filters.to, basis: 'accrual' as const, baseCurrency: 'NZD' as const };
  const [report, comparison, activity, priorActivity] = await Promise.all([
    financialReportInTx(tx, organisationId, query),
    prior ? financialReportInTx(tx, organisationId, { ...query, from: prior.from, to: prior.to }) : Promise.resolve(null),
    activityForRange(tx, organisationId, filters), prior ? activityForRange(tx, organisationId, prior) : Promise.resolve(null),
  ]);
  const ledgerKinds = ['summary', 'receivables', 'payables', 'cash', 'tax'] as const;
  return [...ledgerKinds.map((type) => ledgerReport(type, filters, report, comparison)), reportResultSchema.parse({ type: 'activity', filters, authority: operationalAuthority, metrics: [metric('activity-count', 'Activity count', activity.count, priorActivity?.count ?? null)], rows: activity.rows })];
}

export async function buildReport(tx: Database, organisationId: string, type: DashboardWidgetKind, filters: ReportFilters): Promise<ReportResultDto> {
  const report = (await buildReports(tx, organisationId, filters)).find((item) => item.type === type);
  if (!report) throw new Error(`Unsupported dashboard widget ${type}`);
  return report;
}
