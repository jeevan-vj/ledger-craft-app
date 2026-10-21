import type { Invoice, LineItem } from '@/types/invoice';
import type { Quote, QuoteKind, QuoteStatus } from '@/types/quote';
import { randomId } from '@/utils/id';

export type QuoteAction =
  | 'edit'
  | 'delete'
  | 'markSent'
  | 'share'
  | 'revise'
  | 'accept'
  | 'decline'
  | 'acceptAndConvert'
  | 'convert'
  | 'openInvoice';

export const QUOTE_EMAIL_UNAVAILABLE =
  'Email delivery is unavailable. Share the quote link instead.';

const OPEN_STATUSES: readonly QuoteStatus[] = ['draft', 'sent', 'viewed'];

export function quoteKindLabel(kind: QuoteKind): string {
  return kind === 'estimate' ? 'Estimate' : 'Quote';
}

export function quoteStatusLabel(status: QuoteStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'sent':
      return 'Sent';
    case 'viewed':
      return 'Viewed';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'expired':
      return 'Expired';
    case 'converted':
      return 'Converted';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function availableQuoteActions(status: QuoteStatus): QuoteAction[] {
  switch (status) {
    case 'draft':
      return ['edit', 'delete', 'markSent', 'share'];
    case 'sent':
    case 'viewed':
      return ['share', 'revise', 'accept', 'decline', 'acceptAndConvert'];
    case 'accepted':
      return ['share', 'convert'];
    case 'declined':
    case 'expired':
      return ['share', 'revise'];
    case 'converted':
      return ['openInvoice'];
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayIsoDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export interface QuoteDraftInput {
  customerId: string;
  date: string;
  expiryDate: string;
  items: { description: string; quantity: number; rate: number }[];
}

export function quoteDraftError(draft: QuoteDraftInput): string | null {
  if (!draft.customerId) return 'Choose a customer.';
  if (draft.expiryDate < draft.date) return "Valid until can't be before the quote date.";
  const validItem = draft.items.some(
    (item) => item.description.trim().length > 0 && item.quantity > 0 && item.rate >= 0,
  );
  if (!validItem) return 'Add at least one line item.';
  return null;
}

export function quoteSettingsError(input: {
  format: string;
  sequence: string;
  validity: string;
}): string | null {
  const format = input.format.trim();
  if (!format || format.length > 40) return 'Enter a quote number format up to 40 characters.';
  const sequence = Number(input.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) return 'Quote sequence must be 1 or greater.';
  const validity = Number(input.validity);
  if (!Number.isInteger(validity) || validity < 1 || validity > 365) {
    return 'Quote validity must be between 1 and 365 days.';
  }
  return null;
}

function toCents(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  if (!/^\d+$/.test(whole) || (fraction !== '' && !/^\d+$/.test(fraction))) return 0n;
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -cents : cents;
}

function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function summarizeQuotes(quotes: Pick<Quote, 'status' | 'total' | 'currency'>[]) {
  const open = quotes.filter((quote) => OPEN_STATUSES.includes(quote.status));
  const accepted = quotes.filter((quote) => quote.status === 'accepted');
  const cents = open.reduce((sum, quote) => sum + toCents(quote.total), 0n);
  return {
    openCount: open.length,
    openValue: fromCents(cents),
    acceptedCount: accepted.length,
    currency: quotes.find((quote) => quote.currency)?.currency ?? 'NZD',
  };
}

export function mutationFailureMessage(error: unknown, online: boolean): string {
  if (!online) {
    return 'You are offline. This change was not saved. Try again when you are back online.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The quote could not be updated.';
}

export function createSingleFlight(createKey: () => string = randomId) {
  let inFlight = false;
  let key: string | null = null;
  return {
    claim(): string | null {
      if (inFlight) return null;
      inFlight = true;
      key ??= createKey();
      return key;
    },
    release() {
      inFlight = false;
    },
  };
}

export function decimalText(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(value);
}

export function quoteToPreviewInvoice(quote: Quote, items?: LineItem[]): Invoice {
  return {
    id: quote.id,
    invoiceNumber: quote.quoteNumber,
    customerId: quote.customerId,
    customer: quote.customerName
      ? { id: quote.customerId, name: quote.customerName, email: '' }
      : undefined,
    date: quote.date,
    dueDate: quote.expiryDate,
    items: items ?? quote.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unit: item.unit,
      rate: Number(item.rate),
      total: Number(item.total),
      tax: item.tax == null ? undefined : Number(item.tax),
    })),
    subtotal: Number(quote.subtotal),
    taxAmount: Number(quote.taxAmount),
    discount: quote.discount == null ? null : Number(quote.discount),
    additionalCharges: quote.additionalCharges == null ? null : Number(quote.additionalCharges),
    additionalChargesTotal: quote.additionalChargesTotal == null ? undefined : Number(quote.additionalChargesTotal),
    total: Number(quote.total),
    totalPaid: 0,
    balanceDue: Number(quote.total),
    taxInclusive: quote.taxInclusive,
    status: quote.status as Invoice['status'],
    notes: quote.notes,
    terms: quote.terms,
    currency: quote.currency || 'NZD',
    templateName: quote.templateName ?? 'classic',
  };
}
