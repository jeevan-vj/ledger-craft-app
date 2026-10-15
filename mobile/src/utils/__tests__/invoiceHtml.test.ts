import { describe, expect, it } from '@jest/globals';
import type { BusinessProfile, Invoice } from '@/types/invoice';
import { generateInvoiceHTML } from '../invoiceTemplates';

const invoice: Invoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV/2026 0042',
  customerId: 'customer-1',
  customer: {
    id: 'customer-1',
    name: 'Harbour Studio',
    email: 'accounts@harbour.example',
  },
  date: '2026-10-01',
  dueDate: '2026-10-15',
  items: [
    {
      id: 'line-1',
      description: 'Design services',
      quantity: 1,
      unit: 'service',
      rate: 100,
      total: 100,
      tax: 13.5,
    },
  ],
  subtotal: 100,
  taxAmount: 13.5,
  discount: 10,
  additionalCharges: 5,
  total: 108.5,
  totalPaid: 33.5,
  balanceDue: 75,
  paymentStatus: 'partially_paid',
  taxInclusive: false,
  status: 'sent',
  currency: 'NZD',
};

describe('generateInvoiceHTML', () => {
  it('creates one complete A4 document with the authoritative invoice totals', () => {
    const html = generateInvoiceHTML(invoice, undefined, 'classic');

    expect(html).toMatch(/^\s*<!DOCTYPE html>/i);
    expect(html).toContain('name="viewport" content="width=595, initial-scale=1');
    expect(html).toContain('@page { size: 595px 842px; margin: 0; }');
    expect(html).toContain('Subtotal:');
    expect(html).toContain('$100.00');
    expect(html).toContain('GST (15%):');
    expect(html).toContain('$13.50');
    expect(html).toContain('Discount:');
    expect(html).toContain('-$10.00');
    expect(html).toContain('Additional Charges:');
    expect(html).toContain('$5.00');
    expect(html).toContain('Total:');
    expect(html).toContain('$108.50');
    expect(html).toContain('Amount Due:');
    expect(html).toContain('$75.00');
  });

  it.each(['classic', 'modern', 'minimal', 'executive', 'corporate', 'modernpro'] as const)(
    'uses the same totals markup for the %s template',
    (templateId) => {
      const html = generateInvoiceHTML(invoice, undefined, templateId);

      expect(html).toContain('data-invoice-totals="true"');
      expect(html).toContain('GST (15%):');
      expect(html).toContain('Amount Due:');
      expect(html).toContain('$75.00');
    },
  );

  it('shows zero due for a paid invoice instead of the full total', () => {
    const html = generateInvoiceHTML(
      { ...invoice, status: 'paid', totalPaid: 108.5, balanceDue: 0 },
      undefined,
      'classic',
    );

    expect(html).toContain('Amount Due:');
    expect(html).toContain('$0.00');
  });

  it('escapes user-provided text and attributes before creating invoice HTML', () => {
    const hostileText = `<img src=x onerror="globalThis.pwned=true"> O'Reilly & Co`;
    const profile = {
      id: 'profile-1',
      userId: 'user-1',
      name: hostileText,
      email: 'owner@example.com',
      logoUrl: `https://example.com/logo.png" onerror="globalThis.pwned=true`,
    } as BusinessProfile;
    const html = generateInvoiceHTML(
      {
        ...invoice,
        invoiceNumber: hostileText,
        customer: { ...invoice.customer!, name: hostileText },
        items: [{ ...invoice.items[0], description: hostileText, unit: hostileText }],
        notes: hostileText,
        terms: hostileText,
      },
      profile,
      'classic',
    );

    expect(html).not.toContain('<img src=x onerror=');
    expect(html).not.toContain('logo.png" onerror=');
    expect(html).toContain('&lt;img src=x onerror=&quot;globalThis.pwned=true&quot;&gt; O&#39;Reilly &amp; Co');
    expect(html).toContain('src="https://example.com/logo.png&quot; onerror=&quot;globalThis.pwned=true"');
  });
});
