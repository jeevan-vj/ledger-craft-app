import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMe, signInEmail, signOutSession, signUpEmail } from './authApi';

function jsonResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  } as Response;
}

describe('authApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('signs up through /api/auth/sign-up/email with credentials', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ user: { id: 'u1', email: 'a@example.com', name: 'A' } }),
    );

    await signUpEmail({ name: 'A', email: 'a@example.com', password: 'password123' });

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/sign-up/email',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('signs in through /api/auth/sign-in/email with credentials', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ user: { id: 'u1', email: 'a@example.com', name: 'A' } }),
    );

    await signInEmail({ email: 'a@example.com', password: 'password123' });

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/sign-in/email',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('returns null from getMe on 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: 'req_1' } },
        401,
      ),
    );

    await expect(getMe()).resolves.toBeNull();
  });

  it('signs out through /api/auth/sign-out', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));

    await signOutSession();

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/sign-out',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });
});
