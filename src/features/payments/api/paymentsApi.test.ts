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

  it('sends the optional idempotency key and preserves the canonical payment body', async () => {
    const response = { id: '11111111-1111-4111-8111-111111111111', invoiceId: '22222222-2222-4222-8222-222222222222', invoiceNumber: 'INV-1', paymentMethod: 'bank_transfer', amount: '50.00', paymentDate: '2026-11-06', referenceNumber: null, notes: null, status: 'completed', currency: 'USD', baseCurrency: 'NZD', exchangeRate: '1.6', baseAmount: '80.00', bookBaseAmount: '80.00', exchangeDifference: '0.00', createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 201 })); vi.stubGlobal('fetch', fetcher);
    const input = { invoiceId: response.invoiceId, paymentMethod: 'bank_transfer' as const, amount: '50.00', paymentDate: '2026-11-06', referenceNumber: null, notes: null };
    await expect(paymentsApi.create(input, 'saved-invoice-payment-key')).resolves.toMatchObject({ amount: 50, invoiceId: response.invoiceId });
    expect(fetcher).toHaveBeenCalledWith('/api/payments', expect.objectContaining({ method: 'POST', body: JSON.stringify(input), headers: expect.objectContaining({ 'Idempotency-Key': 'saved-invoice-payment-key' }) }));
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
