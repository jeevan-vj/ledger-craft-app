import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Invoice } from '@/types';
import { createEmailCompatibleInvoiceHtml, createTemplateData, renderTemplateComponent } from '@/services/invoiceTemplateRenderer';
import { quoteDocumentLabels } from './documentLabels';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const invoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV-1',
  customerId: 'customer-1',
  customer: { id: 'customer-1', name: 'Recipient Ltd', email: '', address: null, city: null, state: null, zip: null, country: 'NZ' },
  date: '2026-10-01',
  dueDate: '2026-10-31',
  items: [{ id: 'line-1', description: 'Design', quantity: 1, unit: 'ea', rate: 100, rateUnit: 'ea', total: 100 }],
  subtotal: 100,
  taxAmount: 15,
  total: 115,
  currency: 'NZD',
  status: 'draft',
} satisfies Invoice;

const profile = {
  name: 'Sender Ltd',
  email: 'sender@example.com',
  address: null,
  city: null,
  state: null,
  zip: null,
  country: 'NZ',
  bankAccountName: 'Sender Account',
  bankAccountNumber: '12-3456-7890123-00',
};

describe('document labels', () => {
  it('keeps invoice templates titled INVOICE with payment details', () => {
    render(renderTemplateComponent('classic', createTemplateData(invoice, profile)));
    expect(screen.getByRole('heading', { name: 'INVOICE' })).toBeInTheDocument();
    expect(screen.getByText('Due Date:')).toBeInTheDocument();
    expect(screen.getByText('Payment details')).toBeInTheDocument();
    const html = createEmailCompatibleInvoiceHtml(invoice, profile);
    expect(html).toContain('INVOICE');
    expect(html).toContain('Due Date');
    expect(html).toContain('Payment details');
  });

  it('titles a quote QUOTE, shows valid until, and hides payment details', () => {
    const labels = quoteDocumentLabels('quote');
    render(renderTemplateComponent('classic', createTemplateData(
      { ...invoice, invoiceNumber: 'QUO-2026-0001' },
      profile,
      labels,
    )));
    expect(screen.getByRole('heading', { name: 'QUOTE' })).toBeInTheDocument();
    expect(screen.getByText('Valid until:')).toBeInTheDocument();
    expect(screen.queryByText('Payment details')).not.toBeInTheDocument();
    expect(screen.queryByText('INVOICE')).not.toBeInTheDocument();
    const html = createEmailCompatibleInvoiceHtml({ ...invoice, invoiceNumber: 'QUO-2026-0001' }, profile, labels);
    expect(html).toContain('QUOTE');
    expect(html).toContain('Valid until');
    expect(html).not.toContain('Payment details');
  });

  it('prints QUOTE or ESTIMATE on the modern pro template', () => {
    const { unmount } = render(renderTemplateComponent('modernpro', createTemplateData(
      { ...invoice, invoiceNumber: 'QUO-2026-0001' },
      profile,
      quoteDocumentLabels('quote'),
    )));
    expect(screen.getByText('QUOTE')).toBeInTheDocument();
    expect(screen.getByText('Quote Number')).toBeInTheDocument();
    unmount();

    const estimate = render(renderTemplateComponent('modernpro', createTemplateData(
      { ...invoice, invoiceNumber: 'QUO-2026-0002' },
      profile,
      quoteDocumentLabels('estimate'),
    )));
    expect(screen.getByText('ESTIMATE')).toBeInTheDocument();
    estimate.unmount();

    render(renderTemplateComponent('modernpro', createTemplateData(invoice, profile)));
    expect(screen.getByText('Invoice #')).toBeInTheDocument();
    expect(screen.queryByText('QUOTE')).not.toBeInTheDocument();
    expect(screen.queryByText('ESTIMATE')).not.toBeInTheDocument();
  });

  it('uses ESTIMATE for an estimate', () => {
    render(renderTemplateComponent('minimal', createTemplateData(invoice, profile, quoteDocumentLabels('estimate'))));
    expect(screen.getByRole('heading', { name: 'ESTIMATE' })).toBeInTheDocument();
    expect(screen.getByText(/Valid until:/)).toBeInTheDocument();
  });
});
