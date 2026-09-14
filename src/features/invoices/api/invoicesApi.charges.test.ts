import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoicesApi, toCreateInvoiceRequest } from './invoicesApi';
import type { Invoice } from '@/types';

const charge = { id: 'delivery', type: 'delivery' as const, label: 'Delivery', calculationType: 'fixed' as const, amount: 30, isActive: true };
const input = { customerId: 'customer', date: '2026-09-14', dueDate: '2026-10-14', subtotal: 100, taxAmount: 0, additionalCharges: 30, additionalChargesList: [charge], currency: 'NZD', status: 'draft' } as Invoice;
afterEach(() => vi.unstubAllGlobals());
describe('invoice charge HTTP mapping', () => {
  it('sends names and decimal amounts on create', () => {
    expect(toCreateInvoiceRequest(input, []).additionalChargesList).toEqual([{ ...charge, amount: '30' }]);
  });
  it('sends and reads charges when editing, then reads them after reopening', async () => {
    const dto = { ...input, id: 'invoice', items: [], additionalCharges: '30.00', additionalChargesTotal: '30.00', additionalChargesList: [{ ...charge, amount: '30' }], total: '130.00' };
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(dto)));
    vi.stubGlobal('fetch', fetchMock);
    const updated = await invoicesApi.update('invoice', input);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).additionalChargesList).toEqual(dto.additionalChargesList);
    expect(updated.additionalChargesList).toEqual([charge]);
    expect(updated.additionalChargesTotal).toBe(30);
    expect((await invoicesApi.get('invoice'))?.additionalChargesList).toEqual([charge]);
    await invoicesApi.update('invoice', { additionalChargesList: [], additionalCharges: 0 });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).additionalChargesList).toEqual([]);
  });
});
