import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { expenses } from '../../db/schema/expenses';
import { invoices, lineItems } from '../../db/schema/invoices';
import { bills, billLines } from '../../db/schema/purchases';
import { creditNotes } from '../../db/schema/credit-notes';
import { decimal, roundMoney } from '../invoices/money';
import { ledgerRows, type LedgerRow } from '../reports/reports.repository';
import { allocateGstSettlements } from './gst-payments';
import { gstSettlements } from './gst-payments.repository';

type Period = { from: string; to: string };
type Basis = 'invoice' | 'payments' | 'hybrid';
type Group = LedgerRow[];
const signed = (value: string, reverse: boolean) => reverse ? decimal(0).sub(value) : decimal(value);
const groupGross = (rows: Group) => roundMoney(rows.reduce((sum, row) => sum.add(row.debit), decimal(0)));
const groupTax = (rows: Group, number: string) => roundMoney(rows.filter(row => row.accountNumber === number)
  .reduce((sum, row) => sum.add(row.debit).sub(row.credit), decimal(0)).abs());

function standardSalesTaxAssignments(value: unknown, positiveTax: boolean): boolean {
  if (!Array.isArray(value)) return value == null && !positiveTax;
  let positiveRates = 0;
  for (const assignment of value) {
    if (!assignment || typeof assignment !== 'object' || !('rate' in assignment)
      || typeof assignment.rate !== 'string' || !/^\d+(?:\.\d+)?$/.test(assignment.rate)) return false;
    const rate = decimal(assignment.rate);
    if (rate.compare(0) > 0) {
      if (rate.compare('15') !== 0) return false;
      positiveRates += 1;
    }
  }
  return positiveTax ? positiveRates === 1 : positiveRates <= 1;
}

/** Source gross classification is separate from the operational gross report.
 * It never reverses rounded GST into a guessed purchase amount. Unsupported
 * history leaves the eligible purchase box unknown rather than fabricated. */
export async function gstSourceClassificationInTx(tx: Database, organisationId: string, period: Period, basis: Basis, registeredFrom?: string): Promise<{
  unclassifiedSales: string; claimablePurchases: string | null; salesClassificationSupported: boolean; warnings: string[];
}> {
  const [rows, sourceExpenses, sourceBills, purchaseLines, sourceInvoices, salesLines, settlements, sourceCredits] = await Promise.all([
    ledgerRows(tx, organisationId, { from: '0001-01-01', to: period.to, basis: 'accrual', baseCurrency: 'NZD' }),
    tx.select().from(expenses).where(eq(expenses.organisationId, organisationId)),
    tx.select().from(bills).where(eq(bills.organisationId, organisationId)),
    tx.select().from(billLines).where(eq(billLines.organisationId, organisationId)),
    tx.select().from(invoices).where(eq(invoices.organisationId, organisationId)),
    tx.select().from(lineItems).where(eq(lineItems.organisationId, organisationId)),
    gstSettlements(tx, organisationId),
    tx.select().from(creditNotes).where(eq(creditNotes.organisationId, organisationId)),
  ]);
  const groups = new Map<string, Group>();
  for (const row of rows) groups.set(row.journalEntryId, [...(groups.get(row.journalEntryId) ?? []), row]);
  const originals = (kind: string) => new Map([...groups.values()].filter(group => group[0].referenceType === kind && group[0].referenceId)
    .map(group => [group[0].referenceId!, group]));
  const originalExpenses = originals('expense'); const originalBills = originals('bill'); const originalSales = originals('invoice');
  const expenseById = new Map(sourceExpenses.map(source => [source.id, source]));
  const billById = new Map(sourceBills.map(source => [source.id, source]));
  const invoiceById = new Map(sourceInvoices.map(source => [source.id, source]));
  const creditById = new Map(sourceCredits.map(source => [source.id, source]));
  const warnings = new Set<string>();
  let unsupportedPurchase = false;
  let salesClassificationSupported = true;
  const unsupported = (message: string) => { warnings.add(message); unsupportedPurchase = true; return null; };
  const expenseBudget = (id: string): string | null => {
    const source = expenseById.get(id); const posted = originalExpenses.get(id);
    if (!source || !posted) return unsupported('Historical purchase source is missing or deleted; eligible gross purchases require source review.');
    if (registeredFrom && posted[0].date < registeredFrom) { warnings.add('Pre-registration expense source is excluded from GST-eligible purchases.'); return '0.00'; }
    if (decimal(groupGross(posted)).compare(source.baseAmount) !== 0) return unsupported('Historical expense gross differs from its posted source; eligible gross purchases require review.');
    const excluded = source.gstTreatment === 'exempt' || source.gstTreatment === 'zero_rated';
    const proportion = decimal(String(source.gstClaimablePercentage)).div('100')
      .mul(decimal('100').sub(String(source.privateUsePercentage))).div('100');
    const expectedTax = roundMoney(excluded ? '0' : decimal(source.baseTaxAmount).mul(proportion));
    if (decimal(groupTax(posted, '2150')).compare(expectedTax) !== 0) return unsupported('Historical expense claim classification differs from the posted GST; eligible gross purchases require review.');
    if (excluded || decimal(expectedTax).compare(0) === 0) return '0.00';
    if (decimal(roundMoney(decimal(source.amount).mul('3').div('23'))).compare(source.taxAmount) !== 0) {
      return unsupported('A non-standard or mixed receipt GST amount requires explicit eligible-gross purchase classification review.');
    }
    return roundMoney(decimal(source.baseAmount).mul(proportion));
  };
  const billBudget = (id: string): string | null => {
    const source = billById.get(id); const posted = originalBills.get(id);
    const lines = purchaseLines.filter(line => line.billId === id);
    if (!source || !posted || !lines.length) return unsupported('Historical bill source or line evidence is missing; eligible gross purchases require review.');
    if (registeredFrom && posted[0].date < registeredFrom) { warnings.add('Pre-registration bill source is excluded from GST-eligible purchases.'); return '0.00'; }
    if (lines.some(line => decimal(line.taxAmount).compare(0) > 0 && decimal(line.taxRate).compare('15') !== 0)) return unsupported('A non-standard purchase tax rate requires a reviewed GST box classification.');
    const lineGross = lines.reduce((sum, line) => sum.add(line.total), decimal(0));
    const lineTax = lines.reduce((sum, line) => sum.add(line.taxAmount), decimal(0));
    if (lineGross.compare(source.total) !== 0 || lineTax.compare(source.taxAmount) !== 0
      || decimal(groupGross(posted)).compare(source.baseTotal) !== 0
      || decimal(groupTax(posted, '2150')).compare(source.baseTaxAmount) !== 0) {
      return unsupported('Historical bill classification differs from its immutable posting; eligible gross purchases require review.');
    }
    const taxableGross = lines.filter(line => decimal(line.taxAmount).compare(0) > 0)
      .reduce((sum, line) => sum.add(line.total), decimal(0));
    return roundMoney(taxableGross.mul(source.exchangeRate));
  };
  const zeroSalesBudget = (id: string): string | null => {
    const source = invoiceById.get(id); const posted = originalSales.get(id);
    if (!source || !posted) { salesClassificationSupported = false; warnings.add('Historical sale classification is missing; zero-rated versus exempt supplies require source review.'); return null; }
    if (registeredFrom && posted[0].date < registeredFrom) { warnings.add('Pre-registration sale source is excluded from GST sales classification.'); return '0.00'; }
    if (decimal(groupGross(posted)).compare(source.baseTotal) !== 0 || decimal(groupTax(posted, '2200')).compare(source.baseTaxAmount) !== 0) {
      salesClassificationSupported = false; warnings.add('Historical sale classification differs from the posting; zero-rated versus exempt supplies require source review.'); return null;
    }
    // A fully untaxed source does not need any reconstructed line calculation.
    if (decimal(source.taxAmount).compare(0) === 0) return roundMoney(source.baseTotal);
    const lines = salesLines.filter(line => line.invoiceId === id);
    if (!lines.length) { salesClassificationSupported = false; warnings.add('Historical sale lines are missing; zero-rated versus exempt supplies require source review.'); return null; }
    if (lines.some(line => line.tax == null || !standardSalesTaxAssignments(line.taxes, decimal(line.tax).compare(0) > 0))) {
      salesClassificationSupported = false;
      warnings.add('A non-standard or unknown sales tax assignment requires reviewed GST box classification; only declared 15% GST is supported automatically.');
      return null;
    }
    const untaxed = lines.filter(line => decimal(line.tax).compare(0) === 0);
    if (!untaxed.length) return '0.00';
    if (decimal(source.discount).compare(0) !== 0 || decimal(source.additionalCharges).compare(0) !== 0) {
      salesClassificationSupported = false; warnings.add('Mixed untaxed sales with document discounts or additional charges require source classification review.'); return null;
    }
    return roundMoney(untaxed.reduce((sum, line) => sum.add(line.total), decimal(0)).mul(source.exchangeRate));
  };
  let purchaseGross = decimal(0); let unclassifiedSales = decimal(0);
  const inPeriod = (date: string) => date >= period.from && date <= period.to;
  for (const group of groups.values()) {
    const entry = group[0]; if (!inPeriod(entry.date)) continue;
    if (!['bill', 'bill_void', 'bill_restore', 'expense', 'expense_reversal'].includes(entry.referenceType ?? '')
      && decimal(groupTax(group, '2150')).compare(0) > 0) {
      unsupported('An unsupported or manual GST purchase source requires explicit eligible-gross classification review.');
    }
    if (!['invoice', 'invoice_cancellation', 'invoice_restore', 'credit_note', 'credit_note_reversal'].includes(entry.referenceType ?? '')
      && decimal(groupTax(group, '2200')).compare(0) > 0) {
      salesClassificationSupported = false;
      warnings.add('An unsupported or manual GST sales source requires explicit supply classification review.');
    }
    if (entry.referenceType === 'expense' || entry.referenceType === 'expense_reversal') {
      const sourceId = entry.referenceType === 'expense' ? entry.referenceId : groups.get(entry.referenceId ?? '')?.[0].referenceId;
      const budget = sourceId ? expenseBudget(sourceId) : unsupported('Historical expense reversal has no source classification evidence.');
      if (budget !== null) purchaseGross = purchaseGross.add(signed(budget, entry.referenceType === 'expense_reversal'));
    }
    if (basis === 'invoice' && ['bill', 'bill_void', 'bill_restore'].includes(entry.referenceType ?? '')) {
      const budget = entry.referenceId ? billBudget(entry.referenceId) : unsupported('Historical bill posting has no source classification evidence.');
      if (budget !== null) purchaseGross = purchaseGross.add(signed(budget, entry.referenceType === 'bill_void'));
    }
    if (basis !== 'payments' && ['invoice', 'invoice_cancellation', 'invoice_restore'].includes(entry.referenceType ?? '')) {
      const budget = entry.referenceId ? zeroSalesBudget(entry.referenceId) : null;
      if (budget !== null) unclassifiedSales = unclassifiedSales.add(signed(budget, entry.referenceType === 'invoice_cancellation'));
    }
    if (['credit_note', 'credit_note_reversal'].includes(entry.referenceType ?? '')) {
      if (basis !== 'payments') {
        const creditId = creditById.has(entry.referenceId ?? '') ? entry.referenceId : groups.get(entry.referenceId ?? '')?.[0].referenceId;
        const credit = creditById.get(creditId ?? '');
        const source = credit ? invoiceById.get(credit.invoiceId) : undefined;
        const budget = source ? zeroSalesBudget(source.id) : null;
        if (!source || budget === null || decimal(source.baseTotal).compare(0) <= 0) {
          salesClassificationSupported = false; warnings.add('Historical credit-note sales classification is missing; no zero-rate treatment is inferred.');
        } else {
          // Credit-note service accepts proportional source tax allocations.
          // Allocate the known untaxed source gross, retaining its own cents.
          const movement = roundMoney(decimal(budget).mul(groupGross(group)).div(source.baseTotal));
          unclassifiedSales = unclassifiedSales.add(signed(movement, entry.referenceType === 'credit_note'));
        }
      }
    }
  }
  if (basis !== 'invoice') {
    const eligible = settlements.purchases.filter(row => row.date <= period.to);
    const budgets = new Map<string, string>();
    for (const row of eligible) {
      const budget = billBudget(row.documentId);
      if (budget !== null) budgets.set(row.documentId, budget);
    }
    // The existing cumulative allocator conserves a source budget's cents;
    // here that budget is eligible gross, not a tax-derived approximation.
    purchaseGross = purchaseGross.add(allocateGstSettlements(eligible, budgets, period).tax);
  }
  if (basis === 'payments') {
    const eligible = settlements.sales.filter(row => row.date <= period.to);
    const budgets = new Map<string, string>();
    for (const row of eligible) {
      const budget = zeroSalesBudget(row.documentId);
      if (budget !== null) budgets.set(row.documentId, budget);
    }
    const credits = settlements.credits.map(row => {
      const source = invoiceById.get(row.documentId);
      const budget = budgets.get(row.documentId);
      return { ...row, tax: source && budget && decimal(source.total).compare(0) > 0
        ? roundMoney(decimal(budget).mul(row.amount).div(source.total)) : '0.00' };
    });
    unclassifiedSales = decimal(allocateGstSettlements(eligible, budgets, period, credits).tax);
    const refunds = settlements.refunds.filter(row => row.date <= period.to);
    const refundBudgets = new Map<string, string>();
    for (const row of refunds) {
      const credit = creditById.get(row.documentId);
      const source = credit ? invoiceById.get(credit.invoiceId) : undefined;
      const budget = source ? zeroSalesBudget(source.id) : null;
      if (!credit || !source || budget === null || decimal(source.baseTotal).compare(0) <= 0) {
        salesClassificationSupported = false; warnings.add('Historical refund source classification is missing; no zero-rate treatment is inferred.');
      } else {
        refundBudgets.set(row.documentId, roundMoney(decimal(budget).mul(credit.baseCustomerCreditAmount).div(source.baseTotal)));
      }
    }
    unclassifiedSales = unclassifiedSales.sub(allocateGstSettlements(refunds, refundBudgets, period).tax);
  }
  if (unclassifiedSales.compare(0) !== 0) warnings.add('Untaxed sales require explicit zero-rated versus exempt classification; no zero-rate eligibility has been inferred.');
  return { unclassifiedSales: roundMoney(unclassifiedSales), claimablePurchases: unsupportedPurchase ? null : roundMoney(purchaseGross), salesClassificationSupported, warnings: [...warnings] };
}
