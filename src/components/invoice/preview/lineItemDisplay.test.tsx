import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Invoice } from '@/types';
import { invoiceTemplates, type InvoiceTemplateId } from '@/components/invoice/templates/InvoiceTemplates';
import { createTemplateData, renderTemplateComponent } from '@/services/invoiceTemplateRenderer';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));

const templates = invoiceTemplates.map((template) => template.id);

function line(partial: Partial<Invoice['items'][number]> & Pick<Invoice['items'][number], 'id' | 'description' | 'quantity' | 'unit' | 'rate'>): Invoice['items'][number] {
  return {
    rateUnit: partial.unit,
    total: partial.quantity * partial.rate,
    ...partial,
  };
}

const zeroRowsInvoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV-2026-0003',
  customerId: 'customer-1',
  customer: { id: 'customer-1', name: 'Elizabeth Peiris', email: '', address: null, city: null, state: null, zip: null, country: 'New Zealand', phone: '+64 21 269 8047' },
  date: '2026-10-22',
  dueDate: '2026-11-03',
  items: [
    line({ id: 'cake', description: 'Cake 1kg', quantity: 1, unit: 'kg', rate: 90, rateUnit: 'each' }),
    line({ id: 'rolls', description: 'Chicken Rolls', quantity: 15, unit: 'each', rate: 3, rateUnit: 'each' }),
    line({ id: 'patis', description: 'Fish patis', quantity: 15, unit: 'pcs', rate: 2.5, rateUnit: 'pcs' }),
    line({ id: 'cutlets', description: 'Fish Cutlets', quantity: 15, unit: 'unit', rate: 2.5, rateUnit: 'unit' }),
    line({ id: 'labour', description: 'Prep', quantity: 2, unit: 'hrs', rate: 40, rateUnit: 'hr' }),
  ],
  subtotal: 290,
  taxAmount: 0,
  discount: 0,
  additionalCharges: 0,
  total: 290,
  currency: 'NZD',
  status: 'sent',
} satisfies Invoice;

function strayZero(container: HTMLElement): boolean {
  return Array.from(container.querySelectorAll('*')).some((element) =>
    Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === '0',
    ),
  );
}

describe('invoice line item display', () => {
  it.each(templates)(
    '%s shows a unit once on quantity, a plain price, and no zero-value rows',
    (template: InvoiceTemplateId) => {
      const { container, unmount } = render(renderTemplateComponent(template, createTemplateData(zeroRowsInvoice, null)));
      const text = container.textContent ?? '';

      expect(text).toContain('1 kg');
      expect(text).toContain('2 hrs');
      expect(text).not.toContain('15 each');
      expect(text).not.toContain('15 pcs');
      expect(text).not.toContain('15 unit');
      expect(text).not.toMatch(/\/(each|ea|unit|units|pcs|pc|kg|hrs|hr)\b/);
      expect(text).toContain('NZ$90.00');
      expect(text).toContain('NZ$3.00');
      expect(text).toContain('NZ$45.00');
      expect(text).toContain('NZ$37.50');
      expect(text).toContain('NZ$80.00');
      expect(text).not.toContain('NZ$0.00');
      expect(text).not.toMatch(/Discount/i);
      expect(text).not.toMatch(/Additional Charges/i);
      expect(text).not.toMatch(/Tax/i);
      expect(strayZero(container)).toBe(false);
      unmount();
    },
  );

  it('keeps positive tax, discount, and extra-charge rows and hides a zero charge', () => {
    const invoice = {
      ...zeroRowsInvoice,
      taxAmount: 31.5,
      discount: 10,
      additionalCharges: 5,
      additionalChargesList: [
        { id: 'handling', type: 'handling' as const, label: 'Handling', calculationType: 'fixed' as const, amount: 0, isActive: true },
        { id: 'delivery', type: 'delivery' as const, label: 'Delivery', calculationType: 'fixed' as const, amount: 5, isActive: true },
      ],
      total: 321.5,
    } satisfies Invoice;

    for (const template of ['classic', 'modernpro'] as const) {
      const { container, unmount } = render(renderTemplateComponent(template, createTemplateData(invoice, null)));
      const text = container.textContent ?? '';
      expect(text).toMatch(/Tax \(/);
      expect(text).toMatch(/Discount/);
      expect(text).toMatch(/Delivery/);
      expect(text).not.toMatch(/Handling/);
      expect(text).not.toContain('NZ$0.00');
      expect(strayZero(container)).toBe(false);
      expect(text).toContain('1 kg');
      expect(text).not.toContain('/each');
      unmount();
    }
  });
});
