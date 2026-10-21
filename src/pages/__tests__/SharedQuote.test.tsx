import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { quotesApi } from '@/features/quotes/api/quotesApi';
import { generateInvoicePdf } from '@/utils/pdfUtils';
import SharedQuote from '../SharedQuote';
import type { PublicQuoteView } from '@/features/quotes/api/quotesApi';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/utils/pdfUtils', () => ({ generateInvoicePdf: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/features/quotes/api/quotesApi', () => ({
  quotesApi: { getPublic: vi.fn(), respond: vi.fn() },
  QuotesApiError: class QuotesApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  QuoteAlreadyRespondedError: class QuoteAlreadyRespondedError extends Error {
    response: unknown;
    constructor(response: unknown) {
      super('already');
      this.response = response;
    }
  },
}));

const view: PublicQuoteView = {
  templateName: 'classic',
  status: 'viewed',
  expiryDate: '2026-11-20',
  respondedByName: null,
  responseNote: null,
  respondedAt: null,
  businessProfile: {
    name: 'Sender Ltd',
    email: 'sender@example.com',
    address: null,
    city: null,
    state: null,
    zip: null,
    country: 'NZ',
    bankAccountName: 'Sender Account',
    bankAccountNumber: '12-3456-7890123-00',
  },
  quote: {
    id: 'quote-1',
    quoteNumber: 'QUO-2026-0008',
    kind: 'quote',
    revision: 1,
    customerId: 'customer-1',
    customerName: 'Recipient Ltd',
    date: '2026-10-21',
    expiryDate: '2026-11-20',
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
    status: 'viewed',
    sentAt: null,
    publicViewedAt: null,
    respondedAt: null,
    respondedByName: null,
    responseNote: null,
    acceptedRevision: null,
    convertedInvoiceId: null,
    convertedInvoiceNumber: null,
    items: [{ id: 'line-1', description: 'Design', quantity: 1, unit: 'ea', rate: 100, rateUnit: 'ea', total: 100 }],
    createdAt: '2026-10-21T00:00:00.000Z',
    updatedAt: '2026-10-21T00:00:00.000Z',
  },
};

function mount() {
  return render(
    <MemoryRouter initialEntries={['/shared/quote/token']}>
      <Routes>
        <Route path="/shared/quote/:shareToken" element={<SharedQuote />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SharedQuote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(quotesApi.getPublic).mockResolvedValue(view);
  });

  it('shows the quote without bank details and requires a name to accept', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'QUOTE' })).toBeInTheDocument();
    expect(screen.getByText('Recipient Ltd')).toBeInTheDocument();
    expect(screen.getByText('Valid until:')).toBeInTheDocument();
    expect(screen.queryByText('Payment details')).not.toBeInTheDocument();
    expect(screen.queryByText('Sender Account')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept quote' }));
    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
    expect(quotesApi.respond).not.toHaveBeenCalled();
  });

  it('accepts with a typed name and optional note', async () => {
    vi.mocked(quotesApi.respond).mockResolvedValue({
      action: 'accept',
      name: 'Aroha Ngata',
      note: 'Looks good',
      respondedAt: '2026-10-21T02:00:00.000Z',
      acceptedRevision: 1,
    });
    mount();
    await screen.findByRole('heading', { name: 'QUOTE' });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Aroha Ngata' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Looks good' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept quote' }));
    await waitFor(() => expect(quotesApi.respond).toHaveBeenCalledWith('token', {
      action: 'accept',
      name: 'Aroha Ngata',
      note: 'Looks good',
    }));
    expect(await screen.findByText(/Accepted by Aroha Ngata/)).toBeInTheDocument();
    expect(screen.getByText('Looks good')).toBeInTheDocument();
  });

  it('shows an expired quote without accept or decline', async () => {
    vi.mocked(quotesApi.getPublic).mockResolvedValue({ ...view, status: 'expired', quote: { ...view.quote, status: 'expired' } });
    mount();
    expect(await screen.findByText('This quote has expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept quote' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  it('shows the stored response when the quote was already answered', async () => {
    const { QuoteAlreadyRespondedError } = await import('@/features/quotes/api/quotesApi');
    vi.mocked(quotesApi.respond).mockRejectedValue(new QuoteAlreadyRespondedError({
      action: 'accept',
      name: 'Original Client',
      note: 'Already signed',
      respondedAt: '2026-10-21T01:00:00.000Z',
      acceptedRevision: 1,
    }));
    mount();
    await screen.findByRole('heading', { name: 'QUOTE' });
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Second Person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept quote' }));
    expect(await screen.findByText(/Accepted by Original Client/)).toBeInTheDocument();
    expect(screen.getByText('Already signed')).toBeInTheDocument();
    expect(screen.queryByText(/Second Person/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('explains a revoked link', async () => {
    const { QuotesApiError } = await import('@/features/quotes/api/quotesApi');
    vi.mocked(quotesApi.getPublic).mockRejectedValue(new QuotesApiError('revoked', 410, 'QUOTE_LINK_REVOKED'));
    mount();
    expect(await screen.findByText('Link no longer valid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
  });

  it('downloads a quote PDF from the rendered template', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(generateInvoicePdf).toHaveBeenCalled());
    const options = vi.mocked(generateInvoicePdf).mock.calls[0]?.[4];
    expect(options?.fileName).toBe('Quote-QUO-2026-0008.pdf');
  });
});
