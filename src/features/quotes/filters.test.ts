import { describe, expect, it } from 'vitest';
import { acceptedNotInvoicedCount, applyQuoteListFilters, openQuoteSummary } from './filters';
import type { Quote, QuoteStatus } from './types';

function quote(overrides: Partial<Quote> & Pick<Quote, 'id' | 'status'>): Quote {
  return {
    quoteNumber: `QUO-${overrides.id}`,
    kind: 'quote',
    revision: 1,
    customerId: 'customer-1',
    customerName: 'Kauri Studio',
    date: '2026-10-01',
    expiryDate: '2026-10-31',
    subtotal: 100,
    taxAmount: 15,
    taxRate: 15,
    taxInclusive: false,
    discountType: 'fixed',
    discountPercent: null,
    discount: 0,
    additionalCharges: 0,
    additionalChargesTotal: 0,
    total: 115,
    notes: null,
    terms: null,
    currency: 'NZD',
    templateName: 'classic',
    sentAt: null,
    publicViewedAt: null,
    respondedAt: null,
    respondedByName: null,
    responseNote: null,
    acceptedRevision: null,
    convertedInvoiceId: null,
    convertedInvoiceNumber: null,
    items: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const rows = [
  quote({ id: 'draft', status: 'draft', quoteNumber: 'QUO-2026-0001', total: 100 }),
  quote({ id: 'sent', status: 'sent' as QuoteStatus, quoteNumber: 'QUO-2026-0002', customerName: 'River Co', customerId: 'customer-2', total: 50 }),
  quote({ id: 'accepted', status: 'accepted', quoteNumber: 'QUO-2026-0003', date: '2026-09-01', total: 80 }),
];

describe('applyQuoteListFilters', () => {
  it('counts every status before applying the status tab', () => {
    const result = applyQuoteListFilters(rows, { status: 'accepted' });
    expect(result.quotes.map((item) => item.id)).toEqual(['accepted']);
    expect(result.counts.draft).toBe(1);
    expect(result.counts.sent).toBe(1);
    expect(result.counts.accepted).toBe(1);
  });

  it('searches quote number and customer name', () => {
    expect(applyQuoteListFilters(rows, { q: 'river' }).quotes.map((item) => item.id)).toEqual(['sent']);
    expect(applyQuoteListFilters(rows, { q: 'QUO-2026-0001' }).quotes).toHaveLength(1);
  });

  it('filters by customer and date', () => {
    const result = applyQuoteListFilters(rows, { customerId: 'customer-2', from: '2026-10-01', to: '2026-10-31' });
    expect(result.quotes.map((item) => item.id)).toEqual(['sent']);
  });
});

describe('quote dashboard summaries', () => {
  it('sums open quotes and counts accepted quotes that are not invoiced', () => {
    expect(openQuoteSummary(rows)).toEqual({ count: 2, value: 150 });
    expect(acceptedNotInvoicedCount(rows)).toBe(1);
    expect(acceptedNotInvoicedCount([
      quote({ id: 'converted', status: 'converted', convertedInvoiceId: 'invoice-1' }),
    ])).toBe(0);
  });
});
