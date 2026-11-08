import type { FinancialReportQuery, FinancialReportResponse } from '@ledgercraft/contracts';
import { financialReportResponseSchema, reportColumnPeriods } from '@ledgercraft/contracts';
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

function balanceSides(normal: string, value: ReturnType<typeof decimal>) {
  const signedDebit = normal === 'debit' ? value : zero().sub(value);
  return {
    debit: money(signedDebit.compare(0) > 0 ? signedDebit : zero()),
    credit: money(signedDebit.compare(0) < 0 ? zero().sub(signedDebit) : zero()),
  };
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

export function buildAging(rows: DocumentRow[], asOf: string, control?: ReturnType<typeof decimal>) {
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
  return { total: money(control ?? result.total), unallocatedControl: money(control ? control.sub(result.total) : zero()), current: money(result.current), days1To30: money(result.days1To30), days31To60: money(result.days31To60), days61To90: money(result.days61To90), over90: money(result.over90), items: result.items };
}

function summary(rows: DocumentRow[]) {
  const totals = rows.reduce((acc, row) => ({ subtotal: acc.subtotal.add(row.subtotal), tax: acc.tax.add(row.tax), total: acc.total.add(row.total), paid: acc.paid.add(row.paid), outstanding: acc.outstanding.add(row.balanceDue) }), { subtotal: zero(), tax: zero(), total: zero(), paid: zero(), outstanding: zero() });
  return { subtotal: money(totals.subtotal), tax: money(totals.tax), total: money(totals.total), paid: money(totals.paid), outstanding: money(totals.outstanding) };
}

export function buildFinancialReport(input: { query: FinancialReportQuery; periodRows: LedgerRow[]; openingRows: LedgerRow[]; taxRows?: LedgerRow[]; foreignCurrencyGstDocuments?: number; cashWarnings?:string[]; cashFlowGroups?: Record<string, string>; receivables: DocumentRow[]; payables: DocumentRow[]; comparison?: { rows: LedgerRow[]; from: string; to: string } }): FinancialReportResponse {
  const { query, periodRows, openingRows } = input;
  const period = aggregate(periodRows); const opening = aggregate(openingRows);
  const rows = accountRows(periodRows);
  const trialRows = [...new Set([...period.keys(), ...opening.keys()])].map((id) => {
    const current = period.get(id); const prior = opening.get(id); const source = current?.source ?? prior!.source;
    const openingNet = prior ? (source.normalBalance === 'credit' ? prior.credit.sub(prior.debit) : prior.debit.sub(prior.credit)) : zero();
    const movement = current ? accountBalance(current) : zero(); const closing = openingNet.add(movement);
    const openingSides = balanceSides(source.normalBalance, openingNet);
    const closingSides = balanceSides(source.normalBalance, closing);
    return { accountId: id, accountNumber: source.accountNumber, accountName: source.accountName, accountClass: source.accountClass as AccountClass,
      openingDebit: openingSides.debit, openingCredit: openingSides.credit,
      debit: money(current?.debit ?? zero()), credit: money(current?.credit ?? zero()),
      balance: money(closing), closingDebit: closingSides.debit, closingCredit: closingSides.credit };
  });
  const totalDebits = periodRows.reduce((sum, row) => sum.add(row.debit), zero()); const totalCredits = periodRows.reduce((sum, row) => sum.add(row.credit), zero());
  const revenue = rows.filter((row) => row.accountClass === 'revenue').reduce((sum, row) => sum.add(row.balance), zero());
  const expenses = rows.filter((row) => row.accountClass === 'expense').reduce((sum, row) => sum.add(row.balance), zero()); const netIncome = revenue.sub(expenses);
  const assets = accountRows([...openingRows, ...periodRows]).filter((row) => row.accountClass === 'asset').reduce((sum, row) => sum.add(row.balance), zero());
  const liabilities = accountRows([...openingRows, ...periodRows]).filter((row) => row.accountClass === 'liability').reduce((sum, row) => sum.add(row.balance), zero());
  const closingRows = accountRows([...openingRows, ...periodRows]);
  const ledgerEquity = closingRows.filter((row) => row.accountClass === 'equity').reduce((sum, row) => sum.add(row.balance), zero());
  // The balance sheet is cumulative as of `to`, unlike the period profit and
  // loss statement. Include unclosed profits/losses brought forward as well.
  const cumulativeIncome = closingRows.reduce((sum, row) => row.accountClass === 'revenue'
    ? sum.add(row.balance) : row.accountClass === 'expense' ? sum.sub(row.balance) : sum, zero());
  const equity = ledgerEquity.add(cumulativeIncome);
  const cashRows = periodRows.filter((row) => ['bank', 'cash'].includes(row.accountType)); const openingCashRows = openingRows.filter((row) => ['bank', 'cash'].includes(row.accountType));
  // Imported statement cash and its matching reclassification describe one
  // movement. Net only these linked technical legs; keep source receipts and
  // refunds gross, and retain every original line in the trial balance/ledger.
  const technicalCash = new Map<string, ReturnType<typeof decimal>>();
  let inflows = zero(); let outflows = zero();
  for (const row of cashRows) {
    const group = row.referenceType === 'bank_transaction' ? row.referenceId
      : ['bank_reconciliation_accept', 'bank_reconciliation_undo'].includes(row.referenceType ?? '')
        ? input.cashFlowGroups?.[row.referenceId ?? ''] : undefined;
    if (group) technicalCash.set(group, (technicalCash.get(group) ?? zero()).add(row.debit).sub(row.credit));
    else { inflows = inflows.add(row.debit); outflows = outflows.add(row.credit); }
  }
  for (const amount of technicalCash.values()) {
    if (amount.compare(0) > 0) inflows = inflows.add(amount);
    else outflows = outflows.sub(amount);
  }
  const openingCash = openingCashRows.reduce((sum, row) => sum.add(decimal(row.debit).sub(row.credit)), zero());
  const comparisonRows = input.comparison?.rows ?? []; const comparisonAccounts = accountRows(comparisonRows); const compRevenue = comparisonAccounts.filter((row) => row.accountClass === 'revenue').reduce((sum, row) => sum.add(row.balance), zero()); const compExpenses = comparisonAccounts.filter((row) => row.accountClass === 'expense').reduce((sum, row) => sum.add(row.balance), zero());
  const sales = summary(input.receivables); const purchases = summary(input.payables);
  const taxAccountRows = accountRows(input.taxRows ?? periodRows);
  const outputGst = taxAccountRows.find((row) => row.accountNumber === '2200')?.balance ?? '0.00';
  const inputGst = taxAccountRows.find((row) => row.accountNumber === '2150')?.balance ?? '0.00';
  const netGst = decimal(outputGst).sub(inputGst);
  const position = netGst.compare(0) > 0 ? 'payable' : netGst.compare(0) < 0 ? 'refundable' : 'nil';
  const keyNumbers = new Set(['1200', '2100', '2150', '2200', '4000', '5000']);
  const gstAccounts = taxAccountRows.filter((row) => row.accountNumber === '2150' || row.accountNumber === '2200');
  // Every revenue and expense account is listed (not just 4000/5000) so the
  // underlying-balances table reconciles to the GST collected and paid.
  const keyAccounts = taxAccountRows.filter((row) => keyNumbers.has(row.accountNumber ?? '')
    || row.accountClass === 'revenue' || row.accountClass === 'expense'
    || (input.taxRows ?? periodRows).some((source) => source.accountId === row.accountId && ['bank', 'cash'].includes(source.accountType)));
  const control = (code: string) => trialRows.filter(row => row.accountNumber === code).reduce((sum, row) => code === '1200'
    ? sum.add(row.closingDebit).sub(row.closingCredit) : sum.add(row.closingCredit).sub(row.closingDebit), zero());
  const columnMode = query.columns && query.columns !== 'none' ? query.columns : undefined;
  // Reuse the same ledger engine over the already fetched source rows. No extra
  // SQL per column and no client or alternate formula for account totals.
  const columns = columnMode ? { mode: columnMode, periods: reportColumnPeriods(query.from, query.to, columnMode).map(period => {
    const report = buildFinancialReport({ query: { ...query, from: period.from, to: period.to, columns: undefined, comparisonFrom: undefined, comparisonTo: undefined },
      periodRows: periodRows.filter(row => row.date >= period.from && row.date <= period.to),
      openingRows: [...openingRows, ...periodRows.filter(row => row.date < period.from)], receivables: [], payables: [], cashFlowGroups: input.cashFlowGroups });
    return { ...period, profitLoss: report.profitLoss, cashFlow: report.cashFlow };
  }) } : undefined;
  return financialReportResponseSchema.parse({
    ...(columns ? { columns } : {}),
    meta: { from: query.from, to: query.to, basis: query.basis, baseCurrency: query.baseCurrency, generatedAt: new Date().toISOString(), ...(input.cashWarnings?.length?{warnings:input.cashWarnings}:{}), ...(query.basis==='cash'?{cashRecognition:'settled-source-components-v1'}:{}) },
    trialBalance: { rows: trialRows, totalDebits: money(totalDebits), totalCredits: money(totalCredits), closingDebits: money(trialRows.reduce((sum, row) => sum.add(row.closingDebit), zero())), closingCredits: money(trialRows.reduce((sum, row) => sum.add(row.closingCredit), zero())), balanced: totalDebits.compare(totalCredits) === 0 },
    profitLoss: { rows: rows.filter((row) => row.accountClass === 'revenue' || row.accountClass === 'expense'), revenue: money(revenue), expenses: money(expenses), netIncome: money(netIncome) },
    balanceSheet: { rows: accountRows([...openingRows, ...periodRows]).filter((row) => ['asset', 'liability', 'equity'].includes(row.accountClass)), assets: money(assets), liabilities: money(liabilities), equity: money(equity), accumulatedEarnings: money(cumulativeIncome), balanced: assets.compare(liabilities.add(equity)) === 0 },
    cashFlow: { rows: accountRows(cashRows), openingCash: money(openingCash), inflows: money(inflows), outflows: money(outflows), netCashFlow: money(inflows.sub(outflows)), closingCash: money(openingCash.add(inflows).sub(outflows)) },
    receivablesAging: buildAging(input.receivables, query.to, query.basis === 'accrual' && !query.customerIds?.length && !query.accountIds?.length ? control('1200') : undefined),
    payablesAging: buildAging(input.payables, query.to, query.basis === 'accrual' && !query.vendorIds?.length && !query.accountIds?.length ? control('2100') : undefined), salesSummary: sales, purchaseSummary: purchases,
    taxSummary: {
      collected: money(outputGst), paid: money(inputGst), netPayable: money(netGst),
      outputGst: money(outputGst), inputGst: money(inputGst), netGst: money(netGst), position,
      gstAccounts, keyAccounts,
      basis: 'invoice' as const,
      foreignCurrencyDocumentsExcluded: input.foreignCurrencyGstDocuments ?? 0,
      warnings: input.foreignCurrencyGstDocuments
        ? [`${input.foreignCurrencyGstDocuments} foreign-currency document(s) excluded from GST: amounts are not converted to ${query.baseCurrency}. Review them manually before filing.`]
        : [],
    },
    comparison: input.comparison ? { from: input.comparison.from, to: input.comparison.to, revenue: money(compRevenue), expenses: money(compExpenses), netIncome: money(compRevenue.sub(compExpenses)), netCashFlow: money(comparisonRows.filter((row) => ['bank', 'cash'].includes(row.accountType)).reduce((sum, row) => sum.add(decimal(row.debit).sub(row.credit)), zero())) } : null,
  });
}
