import type { QuoteDto, QuoteStatus } from '@ledgercraft/contracts';
import { apiError } from '../../http-error';

export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['viewed', 'accepted', 'declined', 'expired', 'draft'],
  viewed: ['accepted', 'declined', 'expired', 'draft'],
  accepted: ['converted'],
  declined: ['draft'],
  expired: ['draft'],
  converted: [],
};

export function aucklandToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function effectiveStatus(status: QuoteStatus, expiryDate: string, today: string): QuoteStatus {
  if ((status === 'sent' || status === 'viewed') && expiryDate < today) return 'expired';
  return status;
}

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!QUOTE_TRANSITIONS[from].includes(to)) {
    throw apiError(409, 'INVALID_QUOTE_TRANSITION', `A ${from} quote cannot move to ${to}`);
  }
}

export function assertConversionTotals(
  quote: Pick<QuoteDto, 'subtotal' | 'taxAmount' | 'discount' | 'total'>,
  invoice: Pick<QuoteDto, 'subtotal' | 'taxAmount' | 'discount' | 'total'>,
): void {
  const same = quote.subtotal === invoice.subtotal
    && quote.taxAmount === invoice.taxAmount
    && (quote.discount ?? null) === (invoice.discount ?? null)
    && quote.total === invoice.total;
  if (!same) {
    throw apiError(500, 'CONVERSION_TOTALS_MISMATCH', 'Converted invoice totals do not match the quote');
  }
}
