import * as SecureStore from 'expo-secure-store';
import { quotesApi, type QuoteWriteInput } from './quotesApi';
import type { Quote } from '@/types/quote';

const response = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn(() => null) },
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

const quote = {
  id: 'quote-1',
  quoteNumber: 'QUO-2026-0001',
  kind: 'quote',
  status: 'accepted',
  total: '115.00',
  customerName: 'Harbour Studio',
} as Quote;

const draft: QuoteWriteInput = {
  customerId: 'customer-1',
  date: '2026-10-21',
  expiryDate: '2026-11-20',
  kind: 'quote',
  notes: null,
  terms: null,
  currency: 'NZD',
  templateName: 'classic',
  taxInclusive: false,
  taxRate: '15',
  items: [
    { id: 'line-1', description: 'Design', quantity: 1, unit: 'ea', rate: 100, total: 100 },
  ],
};

function requestUrl(call = 0): string {
  return String((global.fetch as jest.Mock).mock.calls[call][0]);
}

function requestInit(call = 0): RequestInit {
  return (global.fetch as jest.Mock).mock.calls[call][1] as RequestInit;
}

describe('quotesApi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('session-token=test');
    global.fetch = jest.fn();
  });

  it('lists and creates quotes without sending client totals or touching invoices and tax', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ quotes: [quote], counts: { draft: 1 } }))
      .mockResolvedValueOnce(response(quote, 201));

    await quotesApi.list({ customerId: 'customer-1', q: 'Harbour' });
    await quotesApi.create(draft, 'create-key');

    expect(requestUrl(0)).toBe('https://api.example.test/api/quotes?customerId=customer-1&q=Harbour');
    expect(requestUrl(1)).toBe('https://api.example.test/api/quotes');
    expect(requestInit(1)).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Idempotency-Key': 'create-key' }),
    }));
    const body = JSON.parse(String(requestInit(1).body));
    expect(body).toEqual({
      customerId: 'customer-1',
      date: '2026-10-21',
      expiryDate: '2026-11-20',
      kind: 'quote',
      notes: null,
      terms: null,
      currency: 'NZD',
      templateName: 'classic',
      taxInclusive: false,
      taxRate: '15',
      items: [{ description: 'Design', quantity: '1', unit: 'ea', rate: '100', rateUnit: 'ea' }],
    });
    expect(body).not.toHaveProperty('subtotal');
    expect(body).not.toHaveProperty('taxAmount');
    expect(body).not.toHaveProperty('total');
    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(urls.every((url) => url.includes('/api/quotes'))).toBe(true);
    expect(urls.some((url) => url.includes('/api/invoices') || url.includes('/api/tax'))).toBe(false);
  });

  it('reuses one idempotency key when converting the same quote twice', async () => {
    const converted = {
      quote: { ...quote, status: 'converted', convertedInvoiceId: 'invoice-1' },
      invoice: { id: 'invoice-1', invoiceNumber: 'INV-2026-0004' },
    };
    (global.fetch as jest.Mock).mockResolvedValue(response(converted));

    await expect(quotesApi.convert('quote-1', 'same-key')).resolves.toEqual({
      quote: converted.quote,
      invoiceId: 'invoice-1',
      invoiceNumber: 'INV-2026-0004',
    });
    await quotesApi.convert('quote-1', 'same-key');

    expect(requestUrl(0)).toBe('https://api.example.test/api/quotes/quote-1/convert');
    expect(requestInit(0).headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'same-key' }));
    expect(requestInit(1).headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'same-key' }));
    expect(requestUrl(0)).not.toContain('/api/invoices');
    expect(requestUrl(0)).not.toContain('/api/tax');
  });

  it('surfaces expiry, conversion, and cross-organisation errors', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ error: { code: 'QUOTE_EXPIRED', message: 'This quote expired on 2026-10-01' } }, 409))
      .mockResolvedValueOnce(response({ error: { code: 'INVALID_QUOTE_TRANSITION', message: 'A draft quote cannot move to converted' } }, 409))
      .mockResolvedValueOnce(response({ error: { code: 'NOT_FOUND', message: 'Quote not found' } }, 404));

    await expect(quotesApi.setStatus('quote-1', { status: 'accepted' })).rejects.toThrow('This quote expired on 2026-10-01');
    await expect(quotesApi.convert('quote-1', 'key')).rejects.toThrow('A draft quote cannot move to converted');
    await expect(quotesApi.get('quote-1')).rejects.toThrow('Quote not found');
  });

  it('treats a revoked public link as unavailable', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ error: { code: 'QUOTE_LINK_REVOKED', message: 'This link is no longer valid' } }, 410),
    );
    await expect(quotesApi.getPublic('org_token')).resolves.toBeNull();
  });
});
