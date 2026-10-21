import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import InvoiceViewPage from '../InvoiceViewPage';

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
      sourceQuoteId: 'quote-1',
      sourceQuoteNumber: 'QUO-2026-0004',
    }],
  }),
}));
vi.mock('@/components/invoice/preview/InvoicePreview', () => ({
  default: () => <div>Invoice preview</div>,
}));

describe('InvoiceViewPage quote source', () => {
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
});
