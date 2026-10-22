import type { Quote } from './types';

export interface QuoteTimelineEvent {
  id: string;
  label: string;
  detail?: string;
  at?: string | null;
  href?: string;
}

export function quoteTimeline(quote: Quote): QuoteTimelineEvent[] {
  const events: QuoteTimelineEvent[] = [
    { id: 'created', label: 'Created', at: quote.createdAt },
  ];
  if (quote.sentAt) events.push({ id: 'sent', label: 'Sent', at: quote.sentAt });
  if (quote.publicViewedAt) {
    events.push({ id: 'viewed', label: 'Viewed by the client', at: quote.publicViewedAt });
  }
  if (quote.respondedAt) {
    const declined = quote.status === 'declined';
    const detail = [quote.respondedByName, quote.responseNote].filter(Boolean).join(' — ');
    events.push({
      id: 'response',
      label: declined ? 'Declined' : 'Accepted',
      detail: detail || undefined,
      at: quote.respondedAt,
    });
  }
  if (quote.convertedInvoiceId) {
    events.push({
      id: 'converted',
      label: 'Converted to invoice',
      detail: quote.convertedInvoiceNumber ?? undefined,
      at: quote.updatedAt,
      href: `/invoices/${quote.convertedInvoiceId}`,
    });
  }
  return events;
}
