import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthEmailSender } from './auth-email';

describe('auth email sender', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is unavailable without both existing Resend settings', () => {
    expect(createAuthEmailSender({})).toBeUndefined();
    expect(createAuthEmailSender({ RESEND_API_KEY: 'key' })).toBeUndefined();
  });

  it('sends only the destination, product copy, and allow-listed action URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sender = createAuthEmailSender({ RESEND_API_KEY: 'server-secret', RESEND_FROM: 'EasyBiz <hello@example.com>' })!;
    await sender({ kind: 'password-reset', to: 'owner@example.com', url: 'https://easybiz.iamjeevan.com/api/auth/reset-password/reset-token?callbackURL=%2Freset-password' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer server-secret' });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ to: ['owner@example.com'], subject: 'Reset your easybizinvoice password' });
    expect(String(init.body)).toContain('reset-token');
    expect(String(init.body)).not.toMatch(/user[_ -]?id|organisation|cookie|authorization/i);
  });
});
