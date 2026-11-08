import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import QuoteViewPage from '../QuoteViewPage';
const mocks = vi.hoisted(() => ({ refreshInvoices: vi.fn(), convert: vi.fn(), setStatus: vi.fn(), quote: { id: 'quote-1', quoteNumber: 'QUO-1', kind: 'quote', status: 'accepted', total: '115.00', currency: 'NZD', items: [], expiryDate: '2099-01-01', revision: 1 } }));
vi.mock('@/hooks/useAppData', () => ({ useAppData: () => ({ refreshInvoices: mocks.refreshInvoices }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/features/quotes/hooks/useQuotes', () => ({ useQuoteQuery: () => ({ data: mocks.quote }), useRefreshQuotes: () => vi.fn(async () => {}) }));
vi.mock('@/features/quotes/api/quotesApi', () => ({ quotesApi: { convert: mocks.convert, setStatus: mocks.setStatus }, quoteShareUrl: vi.fn() }));
vi.mock('@/components/invoice/preview/InvoicePreview', () => ({ default: () => <div>Quote preview</div> }));
vi.mock('@/features/quotes/components/QuoteTimeline', () => ({ QuoteTimeline: () => null }));
beforeEach(() => { vi.clearAllMocks(); mocks.convert.mockResolvedValue({ invoice: { id: 'invoice-1' } }); mocks.setStatus.mockResolvedValue({}); });
it.each(['accepted', 'sent'])('refreshes saved invoices before navigating from a %s quote', async status => {
 mocks.quote.status = status;
 let complete!: () => void;
 mocks.refreshInvoices.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
 render(<MemoryRouter initialEntries={['/quotes/quote-1']}><Routes><Route path="/quotes/:id" element={<QuoteViewPage />} /><Route path="/invoices/:id" element={<div>New invoice</div>} /></Routes></MemoryRouter>);
 if (status === 'accepted') fireEvent.click(screen.getByRole('button', { name: 'Convert to invoice' }));
 else { fireEvent.click(screen.getByRole('button', { name: 'Mark accepted and convert' })); fireEvent.click(screen.getByRole('button', { name: 'Accept and convert' })); }
 await waitFor(() => expect(mocks.refreshInvoices).toHaveBeenCalledTimes(1));
 expect(screen.queryByText('New invoice')).not.toBeInTheDocument();
 await act(async () => complete());
 expect(await screen.findByText('New invoice')).toBeInTheDocument();
 expect(mocks.convert).toHaveBeenCalledTimes(1);
});
