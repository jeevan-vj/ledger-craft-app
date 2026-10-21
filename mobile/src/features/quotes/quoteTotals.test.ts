import { computeInvoiceTotals } from '../../../../api/src/modules/invoices/totals';
import { previewQuoteTotals } from './quoteTotals';
import type { LineItem } from '@/types/invoice';

const line = (rate: number): LineItem => ({
  id: 'line-1',
  description: 'Consulting',
  quantity: 1,
  unit: 'ea',
  rate,
  total: rate,
});

describe('quote preview totals', () => {
  it('matches the API helper for inclusive GST instead of adding tax on top', () => {
    const preview = previewQuoteTotals({
      items: [line(115)],
      taxInclusive: true,
      taxEnabled: true,
      taxRate: 15,
      discountType: 'fixed',
      discountValue: '',
      additionalCharges: '',
      defaultTaxRate: '15',
    });
    const server = computeInvoiceTotals(
      {
        items: [{ description: 'Consulting', quantity: '1.00', rate: '115.00' }],
        taxInclusive: true,
        taxRate: '15.00',
        discountType: 'fixed',
        discount: null,
        additionalCharges: null,
      },
      '15',
    );

    expect(preview.error).toBeNull();
    expect(preview.taxInclusive).toBe(true);
    expect(preview.total).toBe(server.total);
    expect(preview.taxAmount).toBe(server.taxAmount);
    expect(preview.total).toBe('115.00');
    expect(preview.taxAmount).toBe('15.00');
    expect(preview.subtotal).toBe('100.00');
  });

  it('matches a percent discount and extra charge from the API helper', () => {
    const preview = previewQuoteTotals({
      items: [line(1000)],
      taxInclusive: false,
      taxEnabled: true,
      taxRate: 15,
      discountType: 'percent',
      discountValue: '10',
      additionalCharges: '5',
    });

    expect(preview).toMatchObject({
      error: null,
      subtotal: '1000.00',
      discount: '100.00',
      taxAmount: '135.00',
      additionalCharges: '5.00',
      total: '1040.00',
    });
  });

  it('keeps an extra-charge list in the preview instead of ignoring it', () => {
    const preview = previewQuoteTotals({
      items: [line(100)],
      taxInclusive: false,
      taxEnabled: false,
      taxRate: 0,
      discountType: 'fixed',
      discountValue: '',
      additionalCharges: '',
      additionalChargesList: [{
        id: 'charge-1',
        type: 'delivery',
        label: 'Delivery',
        calculationType: 'fixed',
        amount: '12.50',
        isActive: true,
      }],
    });

    expect(preview.additionalCharges).toBe('12.50');
    expect(preview.total).toBe('112.50');
    expect(preview.taxAmount).toBe('0.00');
  });
});