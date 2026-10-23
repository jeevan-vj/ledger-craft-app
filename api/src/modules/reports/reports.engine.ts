import type { FinancialReportQuery, FinancialReportResponse } from '@ledgercraft/contracts';
import { financialReportResponseSchema } from '@ledgercraft/contracts';
import { decimal, roundMoney } from '../invoices/money';
import type { LedgerRow } from './reports.repository';

type DocumentRow = Awaited<ReturnType<typeof import('./reports.repository').receivables>>[number];
type AccountClass = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

const zero = () => decimal(0);
const money = (value: ReturnType<typeof decimal> | string | number) => roundMoney(value);

function aggregate(rows: LedgerRow[]) {
  const byAccount = new Map<string, { source: LedgerRow; debit: ReturnType<typeof decimal>; credit: ReturnType<typeof decimal> }>();
  for (const row of rows) {
    const current = byAccount.get(row.accountId) ?? { source: row, debit: zero(), credit: zero() };
    current.debit = current.debit.add(row.debit);
    current.credit = current.credit.add(row.credit);
    byAccount.set(row.accountId, current);
  }
  return byAccount;
}

function accountBalance(row: { source: LedgerRow; debit: ReturnType<typeof decimal>; credit: ReturnType<typeof decimal> }) {
  return row.source.normalBalance === 'credit' ? row.credit.sub(row.debit) : row.debit.sub(row.credit);
}

function accountRows(rows: LedgerRow[]) {
  return [...aggregate(rows).values()].map((row) => ({
    accountId: row.source.accountId,
    accountNumber: row.source.accountNumber,
    accountName: row.source.accountName,
    accountClass: row.source.accountClass as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
    debit: money(row.debit), credit: money(row.credit), balance: money(accountBalance(row)),
  })).sort((a, b) => (a.accountNumber ?? '').localeCompare(b.accountNumber ?? '') || a.accountName.localeCompare(b.accountName));
}

function aging(rows: DocumentRow[], asOf: string) {
  const result = { total: zero(), current: zero(), days1To30: zero(), days31To60: zero(), days61To90: zero(), over90: zero(), items: [] as Array<Record<string, unknown>> };
  const end = Date.parse(`${asOf}T00:00:00Z`);
  for (const row of rows) {
    if (decimal(row.balanceDue).compare(0) <= 0) continue;
    const days = Math.floor((end - Date.parse(`${row.dueDate}T00:00:00Z`)) / 86_400_000);
    const bucket = days <= 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
    const key = bucket === 'current' ? 'current' : bucket === '1-30' ? 'days1To30' : bucket === '31-60' ? 'days31To60' : bucket === '61-90' ? 'days61To90' : 'over90';
    result.total = result.total.add(row.balanceDue); result[key] = result[key].add(row.balanceDue);
    result.items.push({ id: row.id, number: row.number, partyId: row.partyId, partyName: row.partyName, issueDate: row.issueDate, dueDate: row.dueDate, balanceDue: money(row.balanceDue), daysOverdue: days, bucket });
  }
  return { total: money(result.total), current: money(result.current), days1To30: money(result.days1To30), days31To60: money(result.days31To60), days61To90: money(result.days61To90), over90: money(result.over90), items: result.items };
}

function summary(rows: DocumentRow[]) {
  const totals = rows.reduce((acc, row) => ({ subtotal: acc.subtotal.add(row.subtotal), tax: acc.tax.add(row.tax), total: acc.total.add(row.total), paid: acc.paid.add(row.paid), outstanding: acc.outstanding.add(row.balanceDue) }), { subtotal: zero(), tax: zero(), total: zero(), paid: zero(), outstanding: zero() });
  return { subtotal: money(totals.subtotal), tax: money(totals.tax), total: money(totals.total), paid: money(totals.paid), outstanding: money(totals.outstanding) };
}

export function buildFinancialReport(input: { query: FinancialReportQuery; periodRows: LedgerRow[]; openingRows: LedgerRow[]; receivables: DocumentRow[]; payables: DocumentRow[]; comparison?: { rows: LedgerRow[]; from: string; to: string } }): FinancialReportResponse {
  const { query, periodRows, openingRows } = input;
  const period = aggregate(periodRows); const opening = aggregate(openingRows);
  const rows = accountRows(periodRows);
  const trialRows = [...new Set([...period.keys(), ...opening.keys()])].map((id) => {
    const current = period.get(id); const prior = opening.get(id); const source = current?.source ?? prior!.source;
    const openingNet = prior ? (source.normalBalance === 'credit' ? prior.credit.sub(prior.debit) : prior.debit.sub(prior.credit)) : zero();
    const movement = current ? accountBalance(current) : zero(); const closing = openingNet.add(movement);
    return { accountId: id, accountNumber: source.accountNumber, accountName: source.accountName, accountClass: source.accountClass as AccountClass,
      openingDebit: money(source.normalBalance === 'debit' && openingNet.compare(0) >= 0 ? openingNet : zero()), openingCredit: money(source.normalBalance === 'credit' && openingNet.compare(0) >= 0 ? openingNet : zero()),
      debit: money(current?.debit ?? zero()), credit: money(current?.credit ?? zero()),
      balance: money(closing), closingDebit: money(source.normalBalance === 'debit' && closing.compare(0) >= 0 ? closing : zero()), closingCredit: money(source.normalBalance === 'credit' && closing.compare(0) >= 0 ? closing : zero()) };
  });
  const totalDebits = periodRows.reduce((sum, row) => sum.add(row.debit), zero()); const totalCredits = periodRows.reduce((sum, row) => sum.add(row.credit), zero());
  const revenue = rows.filter((row) => row.accountClass === 'revenue').reduce((sum, row) => sum.add(row.balance), zero());
  const expenses = rows.filter((row) => row.accountClass === 'expense').reduce((sum, row) => sum.add(row.balance), zero()); const netIncome = revenue.sub(expenses);
  const assets = accountRows([...openingRows, ...periodRows]).filter((row) => row.accountClass === 'asset').reduce((sum, row) => sum.add(row.balance), zero());
  const liabilities = accountRows([...openingRows, ...periodRows]).filter((row) => row.accountClass === 'liability').reduce((sum, row) => sum.add(row.balance), zero());
  const ledgerEquity = accountRows([...openingRows, ...periodRows]).filter((row) => row.accountClass === 'equity').reduce((sum, row) => sum.add(row.balance), zero()); const equity = ledgerEquity.add(netIncome);
  const cashRows = periodRows.filter((row) => ['bank', 'cash'].includes(row.accountType)); const openingCashRows = openingRows.filter((row) => ['bank', 'cash'].includes(row.accountType));
  const inflows = cashRows.reduce((sum, row) => sum.add(row.debit), zero()); const outflows = cashRows.reduce((sum, row) => sum.add(row.credit), zero()); const openingCash = openingCashRows.reduce((sum, row) => sum.add(decimal(row.debit).sub(row.credit)), zero());
  const comparisonRows = input.comparison?.rows ?? []; const comparisonAccounts = accountRows(comparisonRows); const compRevenue = comparisonAccounts.filter((row) => row.accountClass === 'revenue').reduce((sum, row) => sum.add(row.balance), zero()); const compExpenses = comparisonAccounts.filter((row) => row.accountClass === 'expense').reduce((sum, row) => sum.add(row.balance), zero());
  const sales = summary(input.receivables); const purchases = summary(input.payables);
  return financialReportResponseSchema.parse({
    meta: { from: query.from, to: query.to, basis: query.basis, baseCurrency: query.baseCurrency, generatedAt: new Date().toISOString() },
    trialBalance: { rows: trialRows, totalDebits: money(totalDebits), totalCredits: money(totalCredits), balanced: totalDebits.compare(totalCredits) === 0 },
    profitLoss: { rows: rows.filter((row) => row.accountClass === 'revenue' || row.accountClass === 'expense'), revenue: money(revenue), expenses: money(expenses), netIncome: money(netIncome) },
    balanceSheet: { rows: accountRows([...openingRows, ...periodRows]).filter((row) => ['asset', 'liability', 'equity'].includes(row.accountClass)), assets: money(assets), liabilities: money(liabilities), equity: money(equity), balanced: assets.compare(liabilities.add(equity)) === 0 },
    cashFlow: { rows: accountRows(cashRows), openingCash: money(openingCash), inflows: money(inflows), outflows: money(outflows), netCashFlow: money(inflows.sub(outflows)), closingCash: money(openingCash.add(inflows).sub(outflows)) },
    receivablesAging: aging(input.receivables, query.to), payablesAging: aging(input.payables, query.to), salesSummary: sales, purchaseSummary: purchases,
    taxSummary: { collected: sales.tax, paid: purchases.tax, netPayable: money(decimal(sales.tax).sub(purchases.tax)) },
    comparison: input.comparison ? { from: input.comparison.from, to: input.comparison.to, revenue: money(compRevenue), expenses: money(compExpenses), netIncome: money(compRevenue.sub(compExpenses)), netCashFlow: money(comparisonRows.filter((row) => ['bank', 'cash'].includes(row.accountType)).reduce((sum, row) => sum.add(decimal(row.debit).sub(row.credit)), zero())) } : null,
  });
}
