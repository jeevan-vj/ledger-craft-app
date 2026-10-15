import { getMe, signInEmail, signOutSession, signUpEmail } from './authApi';
import { clearCookies } from './cookieJar';

function jsonResponse(
  body: unknown,
  status = 200,
  setCookie?: string[],
): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const cookies = setCookie ?? [];
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 502 ? 'Bad Gateway' : 'OK',
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => text,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'set-cookie' ? cookies[0] ?? null : null,
      getSetCookie: () => cookies,
    },
  } as unknown as Response;
}

describe('mobile authApi', () => {
  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3001';
    global.fetch = jest.fn();
    await clearCookies();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('signs up through /api/auth/sign-up/email, not hosted Supabase', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ user: { id: 'u1', email: 'a@example.com', name: 'A' } }, 200, [
        'better-auth.session_token=abc; Path=/; HttpOnly',
      ]),
    );

    await signUpEmail({ name: 'A', email: 'a@example.com', password: 'password123' });

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/auth/sign-up/email',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
      }),
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'A',
      email: 'a@example.com',
      password: 'password123',
    });
  });

  it('keeps the session when React Native hides Set-Cookie', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'unsigned',
          user: { id: 'u1', email: 'a@example.com', name: 'A' },
        }),
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'set-auth-token' ? 'sess_signed.sig' : null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce(
        jsonResponse({
          user: { id: 'u1', email: 'a@example.com', name: 'A' },
          organisation: { id: '11111111-1111-1111-1111-111111111111', name: 'A' },
          membership: { role: 'owner' },
        }),
      );

    await signUpEmail({ name: 'A', email: 'a@example.com', password: 'password123' });
    await getMe();

    const [, meInit] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
    expect((meInit.headers as Record<string, string>).Cookie).toContain(
      'better-auth.session_token=sess_signed.sig',
    );
  });

  it('sends the session cookie on GET /api/me after sign-up', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: 'u1', email: 'a@example.com', name: 'A' } }, 200, [
          'better-auth.session_token=sess_1; Path=/; HttpOnly',
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          user: { id: 'u1', email: 'a@example.com', name: 'A' },
          organisation: { id: '11111111-1111-1111-1111-111111111111', name: 'A' },
          membership: { role: 'owner' },
        }),
      );

    await signUpEmail({ name: 'A', email: 'a@example.com', password: 'password123' });
    await getMe();

    const [, meInit] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
    expect((meInit.headers as Record<string, string>).Cookie).toContain(
      'better-auth.session_token=sess_1',
    );
  });

  it('surfaces a Better Auth message instead of a raw 502 dump', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ message: 'User already exists' }, 400),
    );

    await expect(
      signUpEmail({ name: 'A', email: 'a@example.com', password: 'password123' }),
    ).rejects.toThrow('User already exists');
  });

  it('does not dump a 502 gateway body to the caller', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
      headers: {
        get: () => null,
        getSetCookie: () => [],
      },
    });

    await expect(
      signUpEmail({ name: 'A', email: 'a@example.com', password: 'password123' }),
    ).rejects.toThrow("Can't reach the account service");
  });

  it('returns null from getMe on 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: 'req_1' } },
        401,
      ),
    );

    await expect(getMe()).resolves.toBeNull();
  });

  it('signs in and signs out through Hono', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: 'u1', email: 'a@example.com', name: 'A' } }, 200, [
          'better-auth.session_token=sess_2; Path=/',
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({}));

    await signInEmail({ email: 'a@example.com', password: 'password123' });
    await signOutSession();

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:3001/api/auth/sign-in/email',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:3001/api/auth/sign-out',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
