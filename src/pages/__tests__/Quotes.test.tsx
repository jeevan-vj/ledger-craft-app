import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quote } from '@/features/quotes/types';
import Quotes from '../Quotes';

const state = vi.hoisted(() => ({
  quotes: [] as Quote[],
}));

vi.mock('@/features/quotes/hooks/useQuotes', () => ({
  useQuotesQuery: () => ({
    data: { quotes: state.quotes, counts: {} },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRefreshQuotes: () => vi.fn(),
}));
vi.mock('@/features/customers/hooks/useCustomerDirectory', () => ({
  useCustomerDirectory: () => ({ customers: [], isLoadingCustomers: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/features/quotes/api/quotesApi', () => ({
  quotesApi: { revise: vi.fn(), share: vi.fn(), duplicate: vi.fn(), convert: vi.fn(), remove: vi.fn(), markSent: vi.fn(), setStatus: vi.fn() },
  quoteShareUrl: (token: string) => `https://app.example/shared/quote/${token}`,
  QuotesApiError: class QuotesApiError extends Error {},
}));

function sample(overrides: Partial<Quote> & Pick<Quote, 'id' | 'status' | 'quoteNumber'>): Quote {
  return {
    kind: 'quote',
    revision: 1,
    customerId: 'customer-1',
    customerName: 'Kauri Studio',
    date: '2026-10-01',
    expiryDate: '2026-10-31',
    subtotal: 100,
    taxAmount: 0,
    taxRate: 0,
    taxInclusive: false,
    discountType: 'fixed',
    discountPercent: null,
    discount: 0,
    additionalCharges: 0,
    additionalChargesTotal: 0,
    total: 100,
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

function mount() {
  return render(
    <MemoryRouter>
      <Quotes />
    </MemoryRouter>,
  );
}

describe('Quotes list', () => {
  beforeEach(() => {
    state.quotes = [];
  });

  it('shows an empty state', () => {
    mount();
    expect(screen.getByText('No quotes yet')).toBeInTheDocument();
  });

  it('filters by status and only enables convert for an accepted quote', () => {
    state.quotes = [
      sample({ id: 'draft', status: 'draft', quoteNumber: 'QUO-2026-0001' }),
      sample({ id: 'accepted', status: 'accepted', quoteNumber: 'QUO-2026-0002', customerName: 'River Co' }),
    ];
    mount();
    expect(screen.getByText('QUO-2026-0001')).toBeInTheDocument();
    const convertButtons = screen.getAllByRole('button', { name: 'Convert' });
    expect(convertButtons[0]).toBeDisabled();
    expect(convertButtons[1]).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/quotes/draft/edit');
    fireEvent.click(screen.getByRole('tab', { name: /Accepted/ }));
    expect(screen.queryByText('QUO-2026-0001')).not.toBeInTheDocument();
    expect(screen.getByText('QUO-2026-0002')).toBeInTheDocument();
  });

  it('warns that revising stops old share links', () => {
    state.quotes = [sample({ id: 'sent', status: 'sent', quoteNumber: 'QUO-2026-0003' })];
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(screen.getByText(/Existing share links will stop working/)).toBeInTheDocument();
  });

  it('searches by customer name', () => {
    state.quotes = [
      sample({ id: 'one', status: 'draft', quoteNumber: 'QUO-2026-0001', customerName: 'Kauri Studio' }),
      sample({ id: 'two', status: 'sent', quoteNumber: 'QUO-2026-0002', customerName: 'River Co' }),
    ];
    mount();
    fireEvent.change(screen.getByLabelText('Search quotes'), { target: { value: 'river' } });
    expect(screen.queryByText('QUO-2026-0001')).not.toBeInTheDocument();
    expect(screen.getByText('QUO-2026-0002')).toBeInTheDocument();
  });
});
