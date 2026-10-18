import DecimalJs from 'decimal.js';
import type { BillLineInput } from '@/features/purchases/api/purchasesApi';

export interface BillPaymentDraft {
  bankAccountId: string;
  amount: string;
  paymentDate: string;
  referenceNumber: string;
}

export function isBillDateRangeValid(issueDate: string, dueDate: string) {
  return Boolean(issueDate && dueDate && dueDate >= issueDate);
}

export function moveDueDateForward(issueDate: string, dueDate: string) {
  return dueDate < issueDate ? issueDate : dueDate;
}

export function createBillPaymentDraft(balanceDue: string, paymentDate: string): BillPaymentDraft {
  return {
    bankAccountId: '',
    amount: balanceDue,
    paymentDate,
    referenceNumber: '',
  };
}

export function hasBillFormChanged(current: unknown, initial: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(initial);
}
function decimal(value: string) {
  try {
    return new DecimalJs(value || 0);
  } catch {
    return new DecimalJs(0);
  }
}

export function calculateBillDraftTotals(lines: BillLineInput[], taxInclusive: boolean) {
  const totals = lines.reduce((sum, line) => {
    const base = decimal(line.quantity).times(decimal(line.unitPrice));
    const rate = decimal(line.taxRate);
    const tax = taxInclusive
      ? rate.isZero() ? new DecimalJs(0) : base.times(rate).div(new DecimalJs(100).plus(rate))
      : base.times(rate).div(100);
    return {
      subtotal: sum.subtotal.plus(taxInclusive ? base.minus(tax) : base),
      tax: sum.tax.plus(tax),
      total: sum.total.plus(taxInclusive ? base : base.plus(tax)),
    };
  }, { subtotal: new DecimalJs(0), tax: new DecimalJs(0), total: new DecimalJs(0) });

  return {
    subtotal: totals.subtotal.toDecimalPlaces(2, DecimalJs.ROUND_HALF_UP).toFixed(2),
    tax: totals.tax.toDecimalPlaces(2, DecimalJs.ROUND_HALF_UP).toFixed(2),
    total: totals.total.toDecimalPlaces(2, DecimalJs.ROUND_HALF_UP).toFixed(2),
  };
}

export function isPaymentAmountValid(amount: string, balanceDue: string): boolean {
  try {
    const value = new DecimalJs(amount);
    return value.isPositive() && value.lessThanOrEqualTo(new DecimalJs(balanceDue));
  } catch {
    return false;
  }
}
