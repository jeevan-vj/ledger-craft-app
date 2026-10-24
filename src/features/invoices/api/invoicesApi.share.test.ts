import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoicesApi } from './invoicesApi';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('public invoice share reads', () => {
  it('reports a revoked or expired link with the inactive message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      error: { code: 'SHARE_INACTIVE', message: 'This link is no longer active', requestId: 'req_share' },
    }, 410)));

    await expect(invoicesApi.getShared('org_token')).rejects.toMatchObject({
      name: 'InvoicesApiError',
      status: 410,
      code: 'SHARE_INACTIVE',
      message: 'This link is no longer active. Ref: req_share',
    });
  });
});
