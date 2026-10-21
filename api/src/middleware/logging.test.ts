import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';

const orgId = '11111111-1111-4111-8111-111111111111';
const shareToken = '22222222-2222-4222-8222-222222222222';

describe('request logging', () => {
  it('logs the route template instead of the share token', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await createApp().request(`/api/public/invoices/${orgId}_${shareToken}`);
    expect(response.status).toBe(503);
    const logged = spy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('/api/public/invoices/:token');
    expect(logged).not.toContain(shareToken);
    spy.mockRestore();
  });

  it('reuses an incoming request id', async () => {
    const response = await createApp().request('/api/healthz', {
      headers: { 'x-request-id': 'req_from_caller' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('req_from_caller');
  });
});
