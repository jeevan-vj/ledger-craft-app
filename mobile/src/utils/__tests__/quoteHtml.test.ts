import type { Invoice } from '@/types/invoice';
import { generateInvoiceHTML, quoteDocumentLabels } from '../invoiceTemplates';

const quotePreview: Invoice = {
  id: 'quote-1',
  invoiceNumber: 'QUO-2026-0001',
  customerId: 'customer-1',
  customer: { id: 'customer-1', name: 'Harbour Studio', email: 'accounts@harbour.example' },
  date: '2026-10-21',
  dueDate: '2026-11-20',
  items: [
    { id: 'line-1', description: 'Design services', quantity: 1, unit: 'service', rate: 100, total: 100 },
  ],
  subtotal: 100,
  taxAmount: 15,
  total: 115,
  totalPaid: 0,
  balanceDue: 115,
  taxInclusive: false,
  status: 'sent',
  currency: 'NZD',
  notes: 'Valid for this scope',
  terms: 'Work starts after acceptance',
};

const profile = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'Harbour Studio',
  email: 'owner@harbour.example',
  bankAccountName: 'Harbour Studio',
  bankAccountNumber: '12-3456-7890123-00',
  bankInfo: 'Pay this account',
};

describe('quote document HTML', () => {
  it.each(['classic', 'modern', 'minimal', 'executive', 'corporate', 'modernpro'] as const)(
    'labels the %s template as a quote and hides payment wording',
    (templateId) => {
      const html = generateInvoiceHTML(quotePreview, profile, templateId, quoteDocumentLabels('quote'));

      expect(html).toContain('QUOTE');
      expect(html).toContain('Valid until');
      expect(html).toContain('$115.00');
      expect(html).not.toMatch(/Invoice/);
      expect(html).not.toContain('Amount Due');
      expect(html).not.toContain('Payment');
      expect(html).not.toContain('12-3456-7890123-00');
      expect(html).not.toContain('Pay this account');
    },
  );

  it('uses ESTIMATE for an estimate without calling it an invoice', () => {
    const html = generateInvoiceHTML(quotePreview, undefined, 'classic', quoteDocumentLabels('estimate'));
    expect(html).toContain('ESTIMATE');
    expect(html).not.toContain('QUOTE');
    expect(html).not.toMatch(/Invoice/);
  });
});
