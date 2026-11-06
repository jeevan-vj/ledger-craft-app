import type { GstPreparationQuery } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { decimal, roundMoney } from '../invoices/money';
import { ledgerRows, unconvertedForeignCurrencyDocumentIds } from '../reports/reports.repository';
import { gstSettlements } from './gst-payments.repository';

type Settlement = { id: string; documentId: string; amount: string; date: string; reversalDate: string | null; status: string; total: string; baseTotal: string; currency: string; bookBaseAmount?: string | null };
type CreditMovement = { id: string; documentId: string; amount: string; tax: string; date: string; reversalDate: string | null };

/** Cumulative allocation conserves source GST cents. Dated receivable credits
 * change the collectible tax budget; their rounding delta belongs to that date,
 * never to an already filed earlier period. Gross follows actual book clearing. */
export function allocateGstSettlements(rows: Settlement[], tax: Map<string, string>, period: Pick<GstPreparationQuery, 'from' | 'to'>, credits: CreditMovement[] = []) {
  const events = [
    ...rows.flatMap(row => [{ kind: 'receipt' as const, row, date: row.date, reverse: false }, ...(row.reversalDate ? [{ kind: 'receipt' as const, row, date: row.reversalDate, reverse: true }] : [])]),
    ...credits.flatMap(row => [{ kind: 'credit' as const, row, date: row.date, reverse: false }, ...(row.reversalDate ? [{ kind: 'credit' as const, row, date: row.reversalDate, reverse: true }] : [])]),
  ].filter(event => event.date <= period.to).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || Number(a.reverse) - Number(b.reverse) || a.row.id.localeCompare(b.row.id));
  const sources = new Map(rows.map(row => [row.documentId, row]));
  const positions = new Map<string, { paid: ReturnType<typeof decimal>; gross: ReturnType<typeof decimal>; tax: ReturnType<typeof decimal>; creditGross: ReturnType<typeof decimal>; creditTax: ReturnType<typeof decimal> }>();
  const allocations = new Map<string, string>();
  let gross = decimal(0); let gst = decimal(0);
  for (const event of events) {
    const source = sources.get(event.row.documentId);
    if (!source || !tax.has(event.row.documentId) || decimal(source.total).compare(0) <= 0) continue;
    const position = positions.get(event.row.documentId) ?? { paid: decimal(0), gross: decimal(0), tax: decimal(0), creditGross: decimal(0), creditTax: decimal(0) };
    let grossDelta = decimal(0);
    if (event.kind === 'credit') {
      const sign = event.reverse ? '-1' : '1';
      position.creditGross = position.creditGross.add(decimal(event.row.amount).mul(sign));
      position.creditTax = position.creditTax.add(decimal(event.row.tax).mul(sign));
    } else if (event.reverse) {
      const originalGross = allocations.get(event.row.id);
      if (originalGross === undefined) continue;
      position.paid = position.paid.sub(event.row.amount); grossDelta = decimal(0).sub(originalGross);
    } else {
      position.paid = position.paid.add(event.row.amount);
      grossDelta = event.row.bookBaseAmount != null ? decimal(event.row.bookBaseAmount) : decimal(roundMoney(decimal(source.baseTotal).mul(position.paid).div(source.total))).sub(position.gross);
      allocations.set(event.row.id, roundMoney(grossDelta));
    }
    const collectible = decimal(source.total).sub(position.creditGross);
    const remainingTax = decimal(tax.get(event.row.documentId)).sub(position.creditTax);
    const target = position.paid.compare(0) === 0 || collectible.compare(0) <= 0 ? decimal(0) : decimal(roundMoney(remainingTax.mul(position.paid).div(collectible)));
    const taxDelta = target.sub(position.tax);
    position.gross = position.gross.add(grossDelta); position.tax = target;
    positions.set(event.row.documentId, position);
    if (event.date >= period.from) { gross = gross.add(grossDelta); gst = gst.add(taxDelta); }
  }
  return { gross: roundMoney(gross), tax: roundMoney(gst) };
}

export async function paymentsBasisGst(tx: Database, organisationId: string, period: GstPreparationQuery) {
  const allRows = await ledgerRows(tx, organisationId, { from: '0001-01-01', to: period.to, basis: 'accrual', baseCurrency: 'NZD' });
  const foreign = await unconvertedForeignCurrencyDocumentIds(tx, organisationId, 'NZD');
  const settlements = await gstSettlements(tx, organisationId);
  const sourceTax = (kind: string, number: string) => new Map(allRows.filter(row => row.referenceType === kind && row.referenceId && !foreign.has(row.referenceId))
    .map(row => row.referenceId!).filter((id, index, ids) => ids.indexOf(id) === index)
    .map(id => [id, allRows.filter(row => row.referenceType === kind && row.referenceId === id && row.accountNumber === number).reduce((sum, row) => kind === 'invoice' ? sum.add(row.credit).sub(row.debit) : sum.add(row.debit).sub(row.credit), decimal(0)).toFixed()]));
  const salesRows = settlements.sales.filter(row => row.currency === 'NZD' || row.bookBaseAmount !== null);
  const purchaseRows = settlements.purchases.filter(row => row.currency === 'NZD' || row.bookBaseAmount !== null);
  const creditMovements = settlements.credits.map(row => ({ ...row, tax: decimal(row.tax).sub(row.liabilityTax).toFixed() }));
  const sales = allocateGstSettlements(salesRows, sourceTax('invoice', '2200'), period, creditMovements);
  const refunds = allocateGstSettlements(settlements.refunds, new Map(settlements.refunds.map(row => [row.documentId, row.tax])), period);
  const bills = allocateGstSettlements(purchaseRows, sourceTax('bill', '2150'), period);
  // Approved expenses are already paid source postings. Their immutable reversal
  // entries preserve history even when the source record has been deleted.
  const expenseRows = allRows.filter(row => row.date >= period.from && ['expense', 'expense_reversal'].includes(row.referenceType ?? '') && (!row.referenceId || !foreign.has(row.referenceId)));
  const expenseEntries = new Map<string, typeof expenseRows>();
  for (const row of expenseRows) expenseEntries.set(row.journalEntryId, [...(expenseEntries.get(row.journalEntryId) ?? []), row]);
  const expenseGross = [...expenseEntries.values()].reduce((sum, rows) => {
    const total = rows.reduce((value, row) => value.add(row.debit), decimal(0));
    return rows[0].referenceType === 'expense_reversal' ? sum.sub(total) : sum.add(total);
  }, decimal(0));
  const expenseTax = expenseRows.filter(row => row.accountNumber === '2150').reduce((sum, row) => sum.add(row.debit).sub(row.credit), decimal(0));
  const foreignSettlement = [...settlements.sales, ...settlements.purchases, ...settlements.refunds].some(row => row.currency !== 'NZD' && !foreign.has(row.documentId) && ((row.date >= period.from && row.date <= period.to) || (row.reversalDate && row.reversalDate >= period.from && row.reversalDate <= period.to)));
  const warnings = foreignSettlement ? ['Foreign payments-basis GST uses the original document-rate NZD carrying amounts allocated to receipts/payments; FX settlement gains/losses are excluded. Confirm that this conversion method is appropriate for your IRD registration with your accountant before saving or filing.'] : [];
  const missingSettlementSnapshots = settlements.sales.length !== salesRows.length || settlements.purchases.length !== purchaseRows.length;
  if (missingSettlementSnapshots) warnings.push('Historical foreign settlement snapshots are missing and have been excluded. Audit and correct these payments before filing.');
  if (settlements.credits.some(row => (row.date >= period.from && row.date <= period.to) || (row.reversalDate && row.reversalDate >= period.from && row.reversalDate <= period.to))) warnings.push('Payments-basis GST includes dated credit-note receivable allocations and rounding movements. Do not enter the same credit note again as a manual adjustment.');
  if (foreign.size) warnings.push('Unconverted legacy foreign journals are excluded. Audit and correct them before filing.');
  return { ...(foreignSettlement || missingSettlementSnapshots ? { requiresReview: true } : {}), totalSales: roundMoney(decimal(sales.gross).sub(refunds.gross)), totalPurchases: roundMoney(decimal(bills.gross).add(expenseGross)), gstOnSales: roundMoney(decimal(sales.tax).sub(refunds.tax)), gstOnPurchases: roundMoney(decimal(bills.tax).add(expenseTax)), warnings };
}
