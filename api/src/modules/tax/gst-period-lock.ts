import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts } from '../../db/schema/accounts';
import { creditNotes } from '../../db/schema/credit-notes';
import { payments } from '../../db/schema/payments';
import { billPayments } from '../../db/schema/purchases';
import { taxReturns } from '../../db/schema/tax';
import { apiError } from '../../http-error';

export type GstBasis = 'invoice' | 'payments' | 'hybrid';
/** Dates the GST engine uses to place a source in a return. */
export type GstLockKind =
  | 'sales_document'
  | 'purchase_document'
  | 'expense'
  | 'credit_note'
  | 'customer_settlement'
  | 'supplier_settlement'
  | 'output_gst_journal'
  | 'input_gst_journal';

export type GstLockCheck = {
  kind: GstLockKind;
  dates: Array<string | null | undefined>;
  /** Existing settlement dates. A new date on or before a filed period end is locked when one of these already falls inside that period. */
  cumulativeWith?: Array<string | null | undefined>;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Invoice basis: invoice, credit note, bill and expense dates, plus journals
 * that post output GST (2200) or input GST (2150). Payment dates are not GST dates.
 * Payments basis: customer receipts, supplier payments, credit notes, expenses
 * and their reversal dates. Invoice and bill issue dates are not GST dates, and
 * a manual GST journal is not included by the payments-basis engine.
 * Hybrid: invoice-date sales (invoices, credit notes, output GST journals) and
 * payments-date purchases (supplier payments and expenses).
 * Each in-force filed return uses the basis stored on its snapshot, not the live setting.
 * A later basis change does not reopen that period.
 * Payments-basis allocation is cumulative: a settlement on or before a filed period end
 * is locked when that document already has a settlement inside the period.
 */
export function gstLockApplies(basis: GstBasis, kind: GstLockKind): boolean {
  switch (kind) {
    case 'sales_document':
    case 'output_gst_journal':
      return basis === 'invoice' || basis === 'hybrid';
    case 'purchase_document':
    case 'input_gst_journal':
      return basis === 'invoice';
    case 'customer_settlement':
      return basis === 'payments';
    case 'supplier_settlement':
      return basis === 'payments' || basis === 'hybrid';
    case 'expense':
    case 'credit_note':
      return true;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function datesOf(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => typeof value === 'string' && DATE.test(value));
}

function snapshotBasis(returnData: unknown): GstBasis {
  const data = returnData as {
    preparation?: { basis?: string };
    gstCalculation?: { period?: { basis?: string }; settings?: { gstAccountingBasis?: string | null } };
  } | null;
  const candidate = data?.gstCalculation?.period?.basis ?? data?.gstCalculation?.settings?.gstAccountingBasis ?? data?.preparation?.basis;
  return candidate === 'payments' || candidate === 'hybrid' || candidate === 'invoice' ? candidate : 'invoice';
}

async function filedGstPeriods(tx: Database, organisationId: string) {
  const rows = await tx.select({
    periodStart: taxReturns.periodStart,
    periodEnd: taxReturns.periodEnd,
    status: taxReturns.status,
    returnType: taxReturns.returnType,
    supersededAt: taxReturns.supersededAt,
    returnData: taxReturns.returnData,
  }).from(taxReturns).where(eq(taxReturns.organisationId, organisationId));
  return rows.filter((row) => row.returnType === 'GST' && (row.status === 'submitted' || row.status === 'approved') && !row.supersededAt)
    .map((row) => ({ periodStart: row.periodStart, periodEnd: row.periodEnd, basis: snapshotBasis(row.returnData) }));
}

export async function assertGstSourceOpen(tx: Database, organisationId: string, checks: GstLockCheck[]) {
  const pending = checks.map((check) => ({ kind: check.kind, dates: datesOf(check.dates), cumulativeWith: datesOf(check.cumulativeWith ?? []) })).filter((check) => check.dates.length > 0);
  if (!pending.length) return;
  const periods = await filedGstPeriods(tx, organisationId);
  if (!periods.length) return;
  for (const check of pending) {
    const hit = periods.find((period) => {
      if (!gstLockApplies(period.basis, check.kind)) return false;
      if (check.dates.some((date) => date >= period.periodStart && date <= period.periodEnd)) return true;
      const anchored = check.cumulativeWith.some((date) => date >= period.periodStart && date <= period.periodEnd);
      return anchored && check.dates.some((date) => date <= period.periodEnd);
    });
    if (hit) {
      throw apiError(409, 'GST_PERIOD_FILED', `This date falls in the filed GST period ${hit.periodStart} to ${hit.periodEnd}. Record a correction in the next open period, or ask an owner or admin to reopen the period.`);
    }
  }
}

export async function invoiceSettlementDates(tx: Database, organisationId: string, invoiceId: string): Promise<string[]> {
  const payRows = await tx.select({ paymentDate: payments.paymentDate, reversalDate: payments.reversalDate }).from(payments)
    .where(and(eq(payments.organisationId, organisationId), eq(payments.invoiceId, invoiceId)));
  const noteRows = await tx.select({ issueDate: creditNotes.issueDate, reversalDate: creditNotes.reversalDate }).from(creditNotes)
    .where(and(eq(creditNotes.organisationId, organisationId), eq(creditNotes.invoiceId, invoiceId)));
  return datesOf([...payRows.flatMap((row) => [row.paymentDate, row.reversalDate]), ...noteRows.flatMap((row) => [row.issueDate, row.reversalDate])]);
}

export async function billSettlementDates(tx: Database, organisationId: string, billId: string): Promise<string[]> {
  const rows = await tx.select({ paymentDate: billPayments.paymentDate, reversalDate: billPayments.reversalDate }).from(billPayments)
    .where(and(eq(billPayments.organisationId, organisationId), eq(billPayments.billId, billId)));
  return datesOf(rows.flatMap((row) => [row.paymentDate, row.reversalDate]));
}

export async function gstJournalChecks(tx: Database, organisationId: string, date: string, accountIds: string[]): Promise<GstLockCheck[]> {
  if (!accountIds.length) return [];
  const rows = await tx.select({ accountNumber: accounts.accountNumber }).from(accounts)
    .where(and(eq(accounts.organisationId, organisationId), inArray(accounts.id, accountIds)));
  const numbers = new Set(rows.map((row) => row.accountNumber));
  const checks: GstLockCheck[] = [];
  if (numbers.has('2200')) checks.push({ kind: 'output_gst_journal', dates: [date] });
  if (numbers.has('2150')) checks.push({ kind: 'input_gst_journal', dates: [date] });
  return checks;
}

export async function openBillPayment(tx: Database, organisationId: string, paymentId: string) {
  const [row] = await tx.select({ paymentDate: billPayments.paymentDate, billId: billPayments.billId }).from(billPayments)
    .where(and(eq(billPayments.organisationId, organisationId), eq(billPayments.id, paymentId), isNull(billPayments.reversalDate)));
  return row;
}
