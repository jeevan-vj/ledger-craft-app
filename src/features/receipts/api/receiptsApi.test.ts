import { afterEach, describe, expect, it, vi } from 'vitest';
import { receiptsApi } from './receiptsApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hono receipt adapter', () => {
  it('maps the stored snapshot into receipt details used by the web UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: '11111111-1111-1111-1111-111111111111',
      paymentId: '22222222-2222-2222-2222-222222222222',
      receiptNumber: 'REC-202610-0001',
      generatedAt: '2026-10-19T00:00:00.000Z',
      emailSentAt: null,
      isEmailed: false,
      receiptData: {
        paymentId: '22222222-2222-2222-2222-222222222222',
        invoiceId: '33333333-3333-3333-3333-333333333333',
        invoiceNumber: 'INV-2026-001',
        customerName: 'Kauri Studio',
        customerEmail: 'accounts@kauri.example',
        amountPaid: '40.00',
        paymentDate: '2026-10-19',
        invoiceDate: '2026-10-01',
        invoiceDueDate: '2026-10-31',
        paymentMethod: 'bank_transfer',
        currency: 'NZD',
        invoiceTotal: '115.00',
        totalPaid: '40.00',
        balanceDue: '75.00',
      },
      createdAt: '2026-10-19T00:00:00.000Z',
    }), { status: 200 })));

    const receipt = await receiptsApi.get('11111111-1111-1111-1111-111111111111');
    expect(receipt?.receiptData).toMatchObject({
      amountPaid: 40,
      balanceAfterPayment: 75,
      customer: { name: 'Kauri Studio', email: 'accounts@kauri.example' },
      invoice: {
        id: '33333333-3333-3333-3333-333333333333',
        invoiceNumber: 'INV-2026-001',
        date: '2026-10-01',
        dueDate: '2026-10-31',
      },
    });
  });

  it('does not invent a due date for an older receipt snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: '11111111-1111-1111-1111-111111111111',
      paymentId: '22222222-2222-2222-2222-222222222222',
      receiptNumber: 'REC-202610-0001',
      generatedAt: '2026-10-19T00:00:00.000Z',
      emailSentAt: null,
      isEmailed: false,
      receiptData: {
        paymentId: '22222222-2222-2222-2222-222222222222',
        invoiceId: '33333333-3333-3333-3333-333333333333',
        invoiceNumber: 'INV-2026-001',
        customerName: 'Kauri Studio',
        customerEmail: null,
        amountPaid: '115.00',
        paymentDate: '2026-10-19',
        paymentMethod: 'bank_transfer',
        currency: 'NZD',
        invoiceTotal: '115.00',
        totalPaid: '115.00',
        balanceDue: '0.00',
      },
      createdAt: '2026-10-19T00:00:00.000Z',
    }), { status: 200 })));

    const receipt = await receiptsApi.get('11111111-1111-1111-1111-111111111111');
    expect(receipt?.receiptData?.invoice.dueDate).toBe('');
  });
});
