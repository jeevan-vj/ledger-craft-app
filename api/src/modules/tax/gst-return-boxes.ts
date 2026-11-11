import type { GstAdjustment, GstCalculationSource } from '@ledgercraft/contracts';
import { decimal, roundMoney } from '../invoices/money';

export type NormalizedGstAdjustment = GstAdjustment & { type: NonNullable<GstAdjustment['type']> | 'other' };

/** Legacy free-text rows become type `other`. Amounts are not rewritten. */
export function normalizeGstAdjustment(row: GstAdjustment): NormalizedGstAdjustment {
  const type = row.type ?? 'other';
  const note = type === 'other' ? (row.note ?? row.reason) : row.note;
  return { ...row, type, ...(note ? { note } : {}) };
}

/**
 * GST that belongs in Box 9 or Box 13.
 * A gross change is already in Box 8 or Box 12 through the 3/23 form fraction.
 */
export function adjustmentBoxAmount(row: { amount: string; grossAdjustment?: string | null }): string {
  const gst = decimal(row.amount);
  const gross = decimal(row.grossAdjustment ?? '0');
  if (gross.compare(0) === 0) return roundMoney(gst);
  return roundMoney(gst.sub(roundMoney(gross.mul('3').div('23'))));
}

export function sumAdjustmentBox(rows: Array<{ kind: 'output' | 'input'; amount: string; grossAdjustment?: string | null }>, kind: 'output' | 'input'): string {
  return roundMoney(rows.filter((row) => row.kind === kind).reduce((sum, row) => sum.add(adjustmentBoxAmount(row)), decimal(0)));
}

/** Ledger GST minus the myIR 3/23 figure. Positive means the books are higher than the form. */
export function roundingDifference(ledger: string, form: string): string {
  return roundMoney(decimal(ledger).sub(form));
}

export function roundingNeedsAcknowledgement(output: string, input: string): boolean {
  return decimal(output).abs().compare('1') > 0 || decimal(input).abs().compare('1') > 0;
}

/**
 * Invoice basis claims Customs GST on the earlier of the assessment and the payment.
 * An unpaid invoice-basis entry is claimed on the assessment date.
 * Payments and hybrid basis claim it only once it is paid.
 */
export function customsClaimDate(basis: 'invoice' | 'payments' | 'hybrid', invoiceDate: string, paymentDate: string | null | undefined): string | null {
  if (basis === 'invoice') {
    if (paymentDate && paymentDate < invoiceDate) return paymentDate;
    return invoiceDate;
  }
  return paymentDate ?? null;
}

const CUSTOMS_JOURNAL_TYPES = new Set(['customs_gst', 'customs_gst_reversal']);

/** Net GST posted to account 2150 by Customs journals dated in the period. */
export function customsGstInPeriod(sources: GstCalculationSource[], from: string, to: string): string {
  const journals = new Set(sources.filter((source) => source.type === 'journals' && source.date >= from && source.date <= to && CUSTOMS_JOURNAL_TYPES.has(String(source.values.referenceType))).map((source) => source.id));
  const net = sources.filter((source) => source.type === 'journalLines' && journals.has(String(source.values.journalId)) && source.values.accountNumber === '2150')
    .reduce((sum, source) => sum.add(String(source.values.debit ?? '0')).sub(String(source.values.credit ?? '0')), decimal(0));
  return roundMoney(net);
}
