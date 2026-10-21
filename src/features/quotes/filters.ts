import { moneyToCents } from '../../../api/src/modules/invoices/money';
import type { Quote, QuoteCounts, QuoteStatus } from './types';
import { emptyQuoteCounts } from './types';

export interface QuoteListFilters {
  status?: QuoteStatus | 'all';
  customerId?: string;
  q?: string;
  from?: string;
  to?: string;
}

/** Same order as the API list: narrow by customer, search, and dates, then count, then status. */
export function applyQuoteListFilters(
  quotes: Quote[],
  filters: QuoteListFilters,
): { quotes: Quote[]; counts: QuoteCounts } {
  let rows = quotes;
  if (filters.customerId) {
    rows = rows.filter((quote) => quote.customerId === filters.customerId);
  }
  const needle = filters.q?.trim().toLowerCase();
  if (needle) {
    rows = rows.filter((quote) =>
      quote.quoteNumber.toLowerCase().includes(needle)
      || (quote.customerName ?? '').toLowerCase().includes(needle),
    );
  }
  if (filters.from) rows = rows.filter((quote) => quote.date >= filters.from!);
  if (filters.to) rows = rows.filter((quote) => quote.date <= filters.to!);

  const counts = emptyQuoteCounts();
  for (const quote of rows) counts[quote.status] += 1;

  if (filters.status && filters.status !== 'all') {
    rows = rows.filter((quote) => quote.status === filters.status);
  }
  return { quotes: rows, counts };
}

const OPEN_STATUSES: ReadonlySet<QuoteStatus> = new Set(['draft', 'sent', 'viewed']);

export function openQuoteSummary(quotes: Quote[]): { count: number; value: number } {
  const open = quotes.filter((quote) => OPEN_STATUSES.has(quote.status));
  return {
    count: open.length,
    value: Number(open.reduce((sum, quote) => sum + moneyToCents(quote.total), 0n)) / 100,
  };
}

export function acceptedNotInvoicedCount(quotes: Quote[]): number {
  return quotes.filter((quote) => quote.status === 'accepted').length;
}
