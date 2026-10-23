import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purchasesApi } from './purchasesApi';

describe('purchasesApi', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('loads vendors and bills with credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ vendors: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ bills: [] }), { status: 200 }));

    await expect(purchasesApi.listVendors()).resolves.toEqual([]);
    await expect(purchasesApi.listBills()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/vendors', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/bills', expect.objectContaining({ credentials: 'include' }));
  });

  it('receives a bill using the lifecycle endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'bill-id' }), { status: 200 }),
    );
    await purchasesApi.receiveBill('bill-id');
    expect(fetchMock).toHaveBeenCalledWith('/api/bills/bill-id/receive', expect.objectContaining({ method: 'POST' }));
  });

  it('cancels, restores, and exports purchase records through explicit endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'bill-id' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'bill-id' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('billNumber,total\nBILL-1,10.00', { status: 200 }));
    await purchasesApi.cancelBill('bill-id');
    await purchasesApi.restoreBill('bill-id');
    await expect(purchasesApi.exportBills()).resolves.toContain('BILL-1');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/bills/bill-id/cancel', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/bills/bill-id/restore', expect.objectContaining({ method: 'POST' }));
  });
});
