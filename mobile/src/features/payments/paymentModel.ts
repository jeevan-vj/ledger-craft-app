import { roundMoney } from '../../../../api/src/modules/invoices/money';
import { AuthApiError } from '@/features/auth/api/http';
import type { Invoice } from '@/types/invoice';
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

const AT_MOST_TWO_DECIMALS = /^\d+(?:\.\d{1,2})?$/;
const MORE_THAN_TWO_DECIMALS = /^\d+\.\d{3,}$/;

/** Canonical 2-decimal amount. More than 2 fractional digits are rejected, not rounded. */
export function normalizePaymentAmount(amount: string): string | null {
  const trimmed = amount.trim();
  if (!AT_MOST_TWO_DECIMALS.test(trimmed)) return null;
  return roundMoney(trimmed);
}

function minorUnits(amount: string): bigint {
  const [whole = '0', fraction = '00'] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
}

export function paymentAmountError(amount: string, balanceDue: string): string | null {
  if (MORE_THAN_TWO_DECIMALS.test(amount.trim())) return 'Enter an amount with at most 2 decimal places.';
  const value = normalizePaymentAmount(amount);
  const balance = normalizePaymentAmount(balanceDue);
  if (!value || minorUnits(value) <= 0n) return 'Enter a positive amount.';
  if (!balance || minorUnits(value) > minorUnits(balance)) return 'Amount cannot exceed the balance due.';
  return null;
}

export function remainingAfterPayment(balanceDue: string, amount: string): string | null {
  const balance = normalizePaymentAmount(balanceDue);
  const value = normalizePaymentAmount(amount);
  if (!balance || !value || minorUnits(value) > minorUnits(balance)) return null;
  const remaining = minorUnits(balance) - minorUnits(value);
  const digits = remaining.toString().padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
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

export class PaymentExceedsBalanceError extends AuthApiError {
  readonly invoice: Invoice;

  constructor(invoice: Invoice, cause: AuthApiError) {
    super(cause.message, cause.status, 'PAYMENT_EXCEEDS_BALANCE', cause.requestId);
    this.name = 'PaymentExceedsBalanceError';
    this.invoice = invoice;
  }
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

export interface PaymentAttemptFields {
  invoiceId: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  referenceNumber: string;
  notes: string;
}

const pendingKeys = new Map<string, Map<string, string>>();
const latestAttempts = new Map<string, { fingerprint: string; fields: PaymentAttemptFields }>();
const inFlightInvoices = new Set<string>();

export function resetPaymentAttemptStore() {
  pendingKeys.clear();
  latestAttempts.clear();
  inFlightInvoices.clear();
}

export function pendingPaymentAttempt(invoiceId: string): PaymentAttemptFields | null {
  const latest = latestAttempts.get(invoiceId);
  if (!latest) return null;
  return pendingKeys.get(invoiceId)?.has(latest.fingerprint) ? latest.fields : null;
}

function dropLatest(invoiceId: string, fingerprint: string) {
  const latest = latestAttempts.get(invoiceId);
  if (latest?.fingerprint === fingerprint) latestAttempts.delete(invoiceId);
}

export function createPaymentAttempt(createKey: () => string = randomId) {
  let invoiceId = '';
  let fingerprint = '';
  return {
    claim(nextFingerprint: string, nextInvoiceId = '', fields?: PaymentAttemptFields): string | null {
      if (inFlightInvoices.has(nextInvoiceId)) return null;
      let keys = pendingKeys.get(nextInvoiceId);
      if (!keys) {
        keys = new Map();
        pendingKeys.set(nextInvoiceId, keys);
      }
      let key = keys.get(nextFingerprint);
      if (!key) {
        key = createKey();
        keys.set(nextFingerprint, key);
      }
      if (fields) latestAttempts.set(nextInvoiceId, { fingerprint: nextFingerprint, fields });
      inFlightInvoices.add(nextInvoiceId);
      invoiceId = nextInvoiceId;
      fingerprint = nextFingerprint;
      return key;
    },
    release() {
      inFlightInvoices.delete(invoiceId);
    },
    succeed() {
      inFlightInvoices.delete(invoiceId);
      pendingKeys.get(invoiceId)?.delete(fingerprint);
      dropLatest(invoiceId, fingerprint);
    },
    resetKey() {
      inFlightInvoices.delete(invoiceId);
      pendingKeys.get(invoiceId)?.delete(fingerprint);
      dropLatest(invoiceId, fingerprint);
    },
  };
}
