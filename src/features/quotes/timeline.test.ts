import { describe, expect, it } from 'vitest';
import { quoteTimeline } from './timeline';
import type { Quote } from './types';

const base = {
  id: 'quote-1',
  quoteNumber: 'QUO-2026-0004',
  kind: 'quote',
  revision: 2,
  customerId: 'customer-1',
  customerName: 'Kauri',
  date: '2026-10-01',
  expiryDate: '2026-10-31',
  subtotal: 10,
  taxAmount: 0,
  taxRate: 0,
  taxInclusive: false,
  discountType: 'fixed',
  discountPercent: null,
  discount: 0,
  additionalCharges: 0,
  additionalChargesTotal: 0,
  total: 10,
  notes: null,
  terms: null,
  currency: 'NZD',
  templateName: null,
  status: 'converted',
  sentAt: '2026-10-02T00:00:00.000Z',
  publicViewedAt: '2026-10-03T00:00:00.000Z',
  respondedAt: '2026-10-04T00:00:00.000Z',
  respondedByName: 'Aroha Ngata',
  responseNote: 'Please proceed',
  acceptedRevision: 2,
  convertedInvoiceId: 'invoice-1',
  convertedInvoiceNumber: 'INV-2026-0009',
  items: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
} satisfies Quote;

describe('quoteTimeline', () => {
  it('includes acceptance details and a link to the converted invoice', () => {
    const events = quoteTimeline(base);
    expect(events.map((event) => event.label)).toEqual([
      'Created',
      'Sent',
      'Viewed by the client',
      'Accepted',
      'Converted to invoice',
    ]);
    expect(events[3]?.detail).toContain('Aroha Ngata');
    expect(events[3]?.detail).toContain('Please proceed');
    expect(events[4]).toMatchObject({ detail: 'INV-2026-0009', href: '/invoices/invoice-1' });
  });
});
