import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteAlreadyRespondedError, QuotesApiError, quotesApi, toQuote, toQuoteRequest } from './quotesApi';

const quoteDto = {
  id: '11111111-1111-4111-8111-111111111111',
  quoteNumber: 'QUO-2026-0001',
  kind: 'quote' as const,
  revision: 1,
  customerId: '22222222-2222-4222-8222-222222222222',
  customerName: 'Kauri Studio',
  date: '2026-10-21',
  expiryDate: '2026-11-20',
  subtotal: '100.00',
  taxAmount: '15.00',
  taxRate: '15.00',
  taxInclusive: false,
  discountType: 'fixed' as const,
  discountPercent: null,
  discount: '0.00',
  additionalCharges: '0.00',
  additionalChargesTotal: '0.00',
  total: '115.00',
  notes: null,
  terms: null,
  currency: 'NZD',
  templateName: 'classic',
  status: 'draft' as const,
  sentAt: null,
  publicViewedAt: null,
  respondedAt: null,
  respondedByName: null,
  responseNote: null,
  acceptedRevision: null,
  convertedInvoiceId: null,
  convertedInvoiceNumber: null,
  items: [{
    id: '33333333-3333-4333-8333-333333333333',
    description: 'Labour',
    quantity: '2',
    unit: 'hr',
    rate: '50.00',
    rateUnit: 'hr',
    tax: null,
    total: '100.00',
  }],
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('quotesApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('maps server totals and does not send a client total', () => {
    const quote = toQuote(quoteDto);
    expect(quote.total).toBe(115);
    expect(quote.taxAmount).toBe(15);
    const request = toQuoteRequest({
      customerId: quote.customerId,
      date: quote.date,
      expiryDate: quote.expiryDate,
      kind: 'estimate',
      taxRate: 15,
      items: quote.items,
    });
    expect(request).not.toHaveProperty('total');
    expect(request).not.toHaveProperty('subtotal');
    expect(request.kind).toBe('estimate');
    expect(request.items[0]?.rate).toBe('50');
  });

  it('loads the list from the quotes API', async () => {
    vi.mocked(fetch).mockResolvedValue(json({
      quotes: [quoteDto],
      counts: { draft: 1, sent: 0, viewed: 0, accepted: 0, declined: 0, expired: 0, converted: 0 },
    }));
    const result = await quotesApi.list();
    expect(fetch).toHaveBeenCalledWith('/api/quotes', expect.objectContaining({ credentials: 'include' }));
    expect(result.quotes[0]?.quoteNumber).toBe('QUO-2026-0001');
    expect(result.counts.draft).toBe(1);
  });

  it('sends an idempotency key when creating a quote', async () => {
    vi.mocked(fetch).mockResolvedValue(json(quoteDto, 201));
    await quotesApi.create({
      customerId: quoteDto.customerId,
      date: quoteDto.date,
      expiryDate: quoteDto.expiryDate,
      items: [{ description: 'Labour', quantity: 2, unit: 'hr', rate: 50, rateUnit: 'hr' }],
    });
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toEqual(expect.any(String));
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('total');
  });

  it('reports a revoked public link', async () => {
    vi.mocked(fetch).mockResolvedValue(json({
      error: { code: 'QUOTE_LINK_REVOKED', message: 'This link is no longer valid' },
    }, 410));
    await expect(quotesApi.getPublic('org_token')).rejects.toMatchObject({
      name: 'QuotesApiError',
      status: 410,
      code: 'QUOTE_LINK_REVOKED',
    });
  });

  it('keeps the existing public response when the client answers twice', async () => {
    const response = {
      action: 'accept',
      name: 'Aroha Ngata',
      note: null,
      respondedAt: '2026-10-21T01:00:00.000Z',
      acceptedRevision: 1,
    };
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(json({
      error: { code: 'QUOTE_ALREADY_RESPONDED', message: 'This quote has already been answered' },
      response,
    }, 409)));
    await expect(quotesApi.respond('org_token', { action: 'decline', name: 'Someone' })).rejects.toBeInstanceOf(QuoteAlreadyRespondedError);
    try {
      await quotesApi.respond('org_token', { action: 'decline', name: 'Someone' });
    } catch (error) {
      expect(error).toBeInstanceOf(QuoteAlreadyRespondedError);
      expect((error as QuoteAlreadyRespondedError).response.name).toBe('Aroha Ngata');
    }
  });

  it('uses the quotes error type for other failures', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: { code: 'QUOTE_EXPIRED', message: 'Expired' } }, 409));
    await expect(quotesApi.respond('org_token', { action: 'accept', name: 'Aroha' })).rejects.toBeInstanceOf(QuotesApiError);
  });
});
