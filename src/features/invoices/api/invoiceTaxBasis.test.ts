import { afterEach, expect, it, vi } from 'vitest';
import { invoicesApi, toCreateInvoiceRequest } from './invoicesApi';
import { computeInvoiceTotals } from '../../../../api/src/modules/invoices/totals';
import type { Invoice } from '@/types';

const inclusive = { id: 'invoice', customerId: 'buyer', invoiceNumber: 'INV-1', date: '2026-10-01', dueDate: '2026-10-31', currency: 'NZD', status: 'draft', subtotal: 869.57, taxAmount: 130.43, total: 1000, taxInclusive: true, taxRate: 15, items: [{ id: 'line', description: 'Services', quantity: 1, unit: 'ea', rate: 1000, rateUnit: 'ea', total: 1000 }] } as Invoice & { taxRate: number };
afterEach(() => vi.unstubAllGlobals());
it('preserves the explicit inclusive basis so the stored1000 boundary matches the preview', () => {
  const payload = toCreateInvoiceRequest(inclusive, inclusive.items);
  expect(payload).toMatchObject({ taxInclusive: true, taxRate: '15' });
  expect(computeInvoiceTotals({ ...payload, items: payload.items ?? [] }, '15').total).toBe('1000.00');
});
it('sends the reviewed tax basis and rate when editing instead of changing the taxable amount', async () => {
  const fetcher = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify({ ...inclusive, customerName: 'Buyer', items: [] }), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  await invoicesApi.update('invoice', inclusive, inclusive.items);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ taxInclusive: true, taxRate: '15' });
});
