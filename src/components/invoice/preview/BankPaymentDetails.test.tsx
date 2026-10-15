import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTemplateData, renderTemplateComponent } from '@/services/invoiceTemplateRenderer';
import type { BusinessProfile, Invoice } from '@/types';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
afterEach(cleanup);
const invoice = { invoiceNumber: 'INV-1', date: '2026-09-14', dueDate: '2026-10-14', items: [], subtotal: 0, total: 0, taxAmount: 0, currency: 'NZD', status: 'draft' } as Invoice;
const profile = { name: 'Kauri', bankAccountName: 'Kauri Studio Ltd', bankAccountNumber: '01-0123-0000123-00' } as BusinessProfile;
describe('invoice bank details', () => {
  for (const template of ['classic', 'modern', 'minimal', 'executive', 'corporate', 'modernpro'] as const) {
    it(`${template} renders separate account rows from business settings`, () => {
      render(renderTemplateComponent(template, createTemplateData(invoice, profile)));
      expect(screen.getByText('Account name:').parentElement).toHaveTextContent('Kauri Studio Ltd');
      expect(screen.getByText('Account number:').parentElement).toHaveTextContent('01-0123-0000123-00');
      expect(screen.getByText('Account name:').parentElement).not.toBe(screen.getByText('Account number:').parentElement);
    });
    it(`${template} hides empty payment details`, () => {
      render(renderTemplateComponent(template, createTemplateData(invoice, null)));
      expect(screen.queryByText('Payment details')).not.toBeInTheDocument();
    });
  }
});

it('omits an empty account name while keeping the account number', () => {
 render(renderTemplateComponent('classic', createTemplateData(invoice, { ...profile, bankAccountName: ' ' })));
 expect(screen.queryByText('Account name:')).not.toBeInTheDocument();
 expect(screen.getByText('01-0123-0000123-00')).toBeVisible();
});

it('escapes bank details in email HTML and keeps separate table rows', async () => {
 const { createEmailCompatibleInvoiceHtml } = await import('@/services/invoiceTemplateRenderer');
 const html = createEmailCompatibleInvoiceHtml(invoice, { ...profile, bankAccountName: '<Studio & Co>' });
 expect(html).toContain('&lt;Studio &amp; Co&gt;');
 expect(html).not.toContain('<Studio & Co>');
 expect(html).toContain('Account number:');
 expect(html).toContain('01-0123-0000123-00');
});
