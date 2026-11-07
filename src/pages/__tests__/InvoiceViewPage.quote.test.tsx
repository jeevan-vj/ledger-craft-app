// Invoice reminder integration is exercised by its dedicated component and browser tests.
vi.mock('@/features/customer-statements/InvoiceReminders', () => ({ InvoiceReminders: () => null }));
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvoiceViewPage from '../InvoiceViewPage';

const getServerCapabilities = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAppData', () => ({
  useAppData: () => ({
    isLoadingInvoices: false,
    invoices: [{
      id: 'invoice-1',
      invoiceNumber: 'INV-2026-0009',
      customerId: 'customer-1',
      date: '2026-10-21',
      dueDate: '2026-11-20',
      items: [],
      subtotal: 100,
      taxAmount: 15,
      total: 115,
      currency: 'NZD',
      status: 'draft',
      balanceDue: 115,
      sourceQuoteId: 'quote-1',
      sourceQuoteNumber: 'QUO-2026-0004',
    }],
  }),
}));
vi.mock('@/services/capabilitiesService', () => ({ getServerCapabilities }));
vi.mock('@/features/invoices/api/invoicesApi', () => ({ invoicesApi: { attachments: vi.fn(async () => []), history: vi.fn(async () => []) } }));
vi.mock('@/components/invoice/preview/InvoicePreview', () => ({
  default: () => <div>Invoice preview</div>,
}));
vi.mock('@/components/invoice/StripePaymentLinkDialog', () => ({ StripePaymentLinkDialog: ({ open }: { open: boolean }) => open ? <div>Stripe payment dialog</div> : null }));

describe('InvoiceViewPage quote source', () => {
  beforeEach(() => { getServerCapabilities.mockResolvedValue({ email: 'available', ai: 'unavailable', stripe: 'unavailable' }); });

  it('links to the quote a draft invoice was converted from', () => {
    render(
      <MemoryRouter initialEntries={['/invoices/invoice-1']}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceViewPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'QUO-2026-0004' });
    expect(link).toHaveAttribute('href', '/quotes/quote-1');
    expect(screen.getByText(/Converted from quote/)).toBeInTheDocument();
  });

  it('hides card payment when the server capability is unavailable', async () => {
    render(<MemoryRouter initialEntries={['/invoices/invoice-1']}><Routes><Route path="/invoices/:id" element={<InvoiceViewPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Invoice preview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /card payment/i })).not.toBeInTheDocument();
  });

  it('shows card payment for an eligible NZD invoice when the capability is available', async () => {
    getServerCapabilities.mockResolvedValue({ email: 'available', ai: 'unavailable', stripe: 'available' });
    render(<MemoryRouter initialEntries={['/invoices/invoice-1']}><Routes><Route path="/invoices/:id" element={<InvoiceViewPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /card payment/i })).toBeInTheDocument();
  });
});
