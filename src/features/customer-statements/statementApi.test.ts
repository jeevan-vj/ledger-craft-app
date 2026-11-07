import { afterEach, expect, it, vi } from 'vitest';
import { statementApi } from './statementApi';
afterEach(() => vi.unstubAllGlobals());
it('sends the same explicit operation key on statement retry and bulk delivery', async () => {
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({sent:true})});vi.stubGlobal('fetch',fetcher);
 const query={type:'activity' as const,from:'2026-10-01',to:'2026-10-31'};
 await statementApi.send('customer',query,'stable-delivery-key');await statementApi.bulk(['customer'],query,'stable-bulk-key');
 expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('stable-delivery-key');expect(fetcher.mock.calls[1][1].headers['Idempotency-Key']).toBe('stable-bulk-key');
});
