import DecimalJs from 'decimal.js';
import { AuthApiError } from '@/features/auth/api/http';
import { formatMoney } from '@/utils/money';
import { randomId } from '@/utils/id';
import { getPaymentMethodLabel } from '@/utils/statusUtils';

const MONTHS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export interface PaymentHistoryInput {
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  referenceNumber?: string | null;
  status: string;
}

export interface PaymentFailure {
  kind: 'offline' | 'exceeds_balance' | 'idempotency_conflict' | 'other';
  message: string;
  refetch?: boolean;
  resetKey?: boolean;
}

export function formatPaymentAmount(amount: string, currency = 'NZD'): string {
  return formatMoney(amount.trim(), currency);
}

export function formatPaymentDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  const month = match ? MONTHS[match[2] ?? ''] : undefined;
  if (!match || !month) return value.trim();
  return `${(match[3] ?? '').replace(/^0/, '')} ${month} ${match[1]}`;
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

export function formatPaymentHistory(payment: PaymentHistoryInput, currency = 'NZD') {
  const reference = payment.referenceNumber?.trim() ?? '';
  return {
    amount: formatPaymentAmount(payment.amount, currency),
    method: getPaymentMethodLabel(payment.paymentMethod),
    date: formatPaymentDate(payment.paymentDate),
    reference: reference || null,
    status: paymentStatusLabel(payment.status),
  };
}

function decimalAmount(value: string): DecimalJs | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  try {
    const amount = new DecimalJs(trimmed);
    return amount.isFinite() ? amount : null;
  } catch {
    return null;
  }
}

export function paymentAmountError(amount: string, balanceDue: string): string | null {
  const value = decimalAmount(amount);
  const balance = decimalAmount(balanceDue);
  if (!value || !value.greaterThan(0)) return 'Enter a positive amount.';
  if (!balance || value.greaterThan(balance)) return 'Amount cannot exceed the balance due.';
  return null;
}

export function remainingAfterPayment(balanceDue: string, amount: string): string | null {
  const balance = decimalAmount(balanceDue);
  const value = decimalAmount(amount);
  if (!balance || !value || value.greaterThan(balance)) return null;
  return balance.minus(value).toFixed(2);
}

export function paymentFingerprint(input: {
  invoiceId: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  referenceNumber: string;
  notes: string;
}): string {
  return JSON.stringify({
    invoiceId: input.invoiceId,
    amount: input.amount.trim(),
    paymentMethod: input.paymentMethod,
    paymentDate: input.paymentDate.trim(),
    referenceNumber: input.referenceNumber.trim(),
    notes: input.notes.trim(),
  });
}

export function invoicePaymentActions(status: string) {
  const paid = status === 'paid';
  return { recordPayment: !paid, edit: !paid };
}

export function mapPaymentError(error: unknown, online: boolean): PaymentFailure {
  const apiError = error instanceof AuthApiError ? error : null;
  if (!online || apiError?.status === 0 || apiError?.code === 'OFFLINE') {
    return {
      kind: 'offline',
      message: 'You are offline. This payment was not recorded and will not be sent later.',
    };
  }
  if (apiError?.code === 'PAYMENT_EXCEEDS_BALANCE') {
    return {
      kind: 'exceeds_balance',
      refetch: true,
      message: 'This amount is more than the balance due. The invoice balance has been refreshed.',
    };
  }
  if (apiError?.status === 409 && apiError.code === 'IDEMPOTENCY_CONFLICT') {
    return {
      kind: 'idempotency_conflict',
      resetKey: true,
      message: 'This payment attempt conflicted with a different request. Check the details and try again.',
    };
  }
  if (error instanceof Error && error.message.trim()) {
    return { kind: 'other', message: error.message };
  }
  return { kind: 'other', message: 'The payment could not be recorded.' };
}

export function createPaymentAttempt(createKey: () => string = randomId) {
  let inFlight = false;
  let key: string | null = null;
  let fingerprint = '';
  return {
    claim(nextFingerprint: string): string | null {
      if (inFlight) return null;
      if (key !== null && nextFingerprint !== fingerprint) key = null;
      fingerprint = nextFingerprint;
      inFlight = true;
      key ??= createKey();
      return key;
    },
    release() {
      inFlight = false;
    },
    succeed() {
      inFlight = false;
      key = null;
    },
    resetKey() {
      inFlight = false;
      key = null;
    },
  };
}
