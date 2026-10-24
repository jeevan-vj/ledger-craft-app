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


describe('invoice share management transport', () => {
  it('lists current server expiry and explicitly requests replacement only when supplied', async () => {
    const share = { shareToken: 'private-token', templateName: 'modern', expiresAt: null, isActive: true, accessCount: 0, createdAt: '2026-10-24T00:00:00Z' };
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ shares: [share] })).mockImplementation(async () => json(share));
    vi.stubGlobal('fetch', fetchMock);
    expect(await invoicesApi.shares('invoice-id')).toEqual([share]);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/invoices/invoice-id/shares', expect.objectContaining({ credentials: 'include' }));
    await invoicesApi.share('invoice-id', { templateName: 'modern' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ templateName: 'modern' });
    await invoicesApi.share('invoice-id', { templateName: 'modern', replace: true, expiresAt: '2026-10-26T00:00:00Z' });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ templateName: 'modern', replace: true, expiresAt: '2026-10-26T00:00:00Z' });
  });
});
