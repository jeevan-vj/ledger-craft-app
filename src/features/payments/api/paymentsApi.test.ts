import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { paymentsApi } from './paymentsApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hono payment and invoice adapters', () => {
  it('keeps the invoice number returned with a payment', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: '11111111-1111-1111-1111-111111111111',
      invoiceId: '22222222-2222-2222-2222-222222222222',
      invoiceNumber: 'INV-2026-001',
      paymentMethod: 'bank_transfer',
      amount: '40.00',
      paymentDate: '2026-10-19',
      referenceNumber: null,
      notes: null,
      status: 'completed',
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    }), { status: 200 })));

    await expect(paymentsApi.get('11111111-1111-1111-1111-111111111111')).resolves.toMatchObject({
      invoiceNumber: 'INV-2026-001',
    });
  });

  it('keeps authoritative payment totals returned with an invoice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ invoices: [{
      id: '22222222-2222-2222-2222-222222222222',
      invoiceNumber: 'INV-2026-001',
      customerId: '33333333-3333-3333-3333-333333333333',
      customerName: 'Kauri Studio',
      date: '2026-10-01',
      dueDate: '2026-10-31',
      paymentTermDays: 30,
      subtotal: '100.00',
      taxAmount: '15.00',
      discountType: 'fixed',
      discountPercent: null,
      discount: null,
      additionalCharges: null,
      additionalChargesList: [],
      additionalChargesTotal: '0.00',
      total: '115.00',
      totalPaid: '40.00',
      balanceDue: '75.00',
      paymentStatus: 'partially_paid',
      taxInclusive: false,
      status: 'sent',
      notes: null,
      terms: null,
      currency: 'NZD',
      items: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    }] }), { status: 200 })));

    await expect(invoicesApi.list()).resolves.toEqual([
      expect.objectContaining({
        totalPaid: 40,
        balanceDue: 75,
        paymentStatus: 'partially_paid',
        taxInclusive: false,
      }),
    ]);
  });
});
