import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportsApi } from './reportsApi';

afterEach(() => vi.restoreAllMocks());

describe('reportsApi', () => {
  it('passes authoritative period and basis filters to Hono', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(reportsApi.financial({ from: '2026-01-01', to: '2026-12-31', basis: 'cash', baseCurrency: 'NZD' })).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/reports/financial?from=2026-01-01&to=2026-12-31&basis=cash&baseCurrency=NZD', { credentials: 'include' });
  });
});
