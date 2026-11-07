import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Invoice, BusinessProfile } from '@/types';
import { createEmailCompatibleInvoiceHtml, createTemplateData, renderTemplateComponent } from '@/services/invoiceTemplateRenderer';
import type { InvoiceTemplateId } from '@/components/invoice/templates/InvoiceTemplates';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
afterEach(cleanup);
const invoice: Invoice = { id: 'invoice', invoiceNumber: 'INV-2026-001', customerId: 'buyer', customer: { id: 'buyer', name: 'Buyer Ltd', email: 'buyer@example.test', address: null, city: null, state: null, zip: null, country: 'NZ' }, date: '2026-10-01', dueDate: '2026-10-31', currency: 'NZD', status: 'draft', subtotal: 100, taxAmount: 15, total: 115, items: [{ id: 'line', description: 'Consulting', quantity: 1, unit: 'ea', rate: 100, rateUnit: 'ea', total: 100 }] };
const profile: BusinessProfile & { gstRegisteredFrom: string } = { name: 'Kauri GST Limited', email: 'owner@example.test', address: null, city: null, state: null, zip: null, country: 'NZ', taxId: '49098576', gstRegistrationStatus: 'registered', gstRegisteredFrom: '2026-04-01' };
const templates: InvoiceTemplateId[] = ['classic', 'modern', 'minimal', 'executive', 'corporate', 'modernpro'];

describe('GST identity on every invoice document', () => {
  it.each(templates)('%s prints Tax invoice and the seller GST number', (template) => {
    render(renderTemplateComponent(template, createTemplateData(invoice, profile)));
    expect(screen.getByText(/^Tax invoice$/i)).toBeInTheDocument();
    expect(screen.getByText('GST No: 49-098-576')).toBeInTheDocument();
    expect(screen.getByText(/Kauri GST Limited/)).toBeInTheDocument();
  });
  it.each(templates)('%s does not claim GST registration for an unregistered seller', (template) => {
    render(renderTemplateComponent(template, createTemplateData({ ...invoice, taxAmount: 0, total: 100 }, { ...profile, gstRegistrationStatus: 'not_registered' })));
    expect(screen.queryByText(/^Tax invoice$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GST No:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Tax \(/i)).not.toBeInTheDocument();
  });
  it('also prints seller identity in email-compatible HTML', () => {
    const html = createEmailCompatibleInvoiceHtml(invoice, profile);
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('GST No: 49-098-576');
  });
  it('preserves a saved amount but flags an unregistered seller with old tax amounts', () => {
    const html = createEmailCompatibleInvoiceHtml(invoice, { ...profile, gstRegistrationStatus: 'not_registered' });
    expect(html).not.toContain('GST No:');
    expect(html).not.toContain('Tax (');
    expect(html).toContain('Review its original amounts');
    expect(html).toContain('115.00');
  });
  it('does not label legacy missing registration details as a ready Tax invoice', () => {
    render(renderTemplateComponent('classic', createTemplateData(invoice, { ...profile, gstRegisteredFrom: undefined })));
    expect(screen.queryByText(/^Tax invoice$/i)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/GST settings|registration/i);
  });
  it('requires a valid seller GST number before claiming Tax invoice', () => {
    render(renderTemplateComponent('classic', createTemplateData(invoice, { ...profile, taxId: '123456789' })));
    expect(screen.queryByText(/^Tax invoice$/i)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/GST settings|registration/i);
  });
  it('does not impose NZ registration wording on a foreign business', () => {
    render(renderTemplateComponent('classic', createTemplateData(invoice, { ...profile, country: 'AU', taxId: 'Foreign identifier' })));
    expect(screen.getByRole('heading', { name: 'INVOICE' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/GST No:/)).not.toBeInTheDocument();
  });
  it('does not claim GST registration for a saved invoice before its effective date', () => {
    render(renderTemplateComponent('classic', createTemplateData({ ...invoice, date: '2026-03-15' }, profile)));
    expect(screen.queryByText(/^Tax invoice$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GST No:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^GST \(/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/predates.*registration/i);
  });
  it('shows the exact zero GST amount on a registered zero-rated invoice', () => {
    render(renderTemplateComponent('classic', createTemplateData({ ...invoice, taxAmount: 0, total: 100 }, profile)));
    expect(screen.getByText(/^GST \(/)).toBeInTheDocument();
    expect(screen.getByText(/Subtotal excludes GST; total includes GST/)).toBeInTheDocument();
  });
});
