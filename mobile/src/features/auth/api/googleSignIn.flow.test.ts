import { clearCookies, getCookieHeader } from './cookieJar';
import { GoogleSignInError, signInWithGoogle } from './authApi';
import { clearPendingGoogleSignIn } from '../googleSignIn';

function jsonResponse(body: unknown, status = 200, setCookie?: string[]): Response {
  const cookies = setCookie ?? [];
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: {
      get: (name: string) => (name.toLowerCase() === 'set-cookie' ? cookies[0] ?? null : null),
      getSetCookie: () => cookies,
    },
  } as unknown as Response;
}

describe('mobile Google sign-in flow', () => {
  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3001';
    global.fetch = jest.fn();
    await clearCookies();
    await clearPendingGoogleSignIn();
  });

  it('does not open the browser when Google is disabled', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ google: false }));
    const open = jest.fn();
    await expect(signInWithGoogle(open)).rejects.toMatchObject({ code: 'disabled' });
    expect(open).not.toHaveBeenCalled();
  });

  it('reports a disabled provider response without storing a session', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ google: true }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Google sign-in is not configured.', code: 'GOOGLE_SIGN_IN_DISABLED' }, 404));
    const open = jest.fn();
    await expect(signInWithGoogle(open)).rejects.toBeInstanceOf(GoogleSignInError);
    expect(open).not.toHaveBeenCalled();
    expect(await getCookieHeader()).toBeNull();
  });

  it('treats a closed browser as cancelled and a denied consent as denied', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ google: true }))
      .mockResolvedValueOnce(jsonResponse({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc' }));
    await expect(signInWithGoogle(async () => null)).rejects.toMatchObject({ code: 'cancelled' });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ google: true }))
      .mockResolvedValueOnce(jsonResponse({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc' }));
    await expect(signInWithGoogle(async (url) => {
      const state = new URL(JSON.parse(String((global.fetch as jest.Mock).mock.calls.at(-1)?.[1]?.body)).callbackURL).searchParams.get('state');
      expect(url).toContain('/api/auth/google/browser?authorizationURL=');
      return `easybizinvoice://auth/google?error=access_denied&error_description=The%20user%20denied%20the%20request&state=${state}`;
    })).rejects.toMatchObject({ code: 'denied', message: 'Google sign-in was denied.' });
    expect(await getCookieHeader()).toBeNull();
  });

  it('exchanges the one-time code and stores the session like email sign-in', async () => {
    const authorization = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ google: true }))
      .mockResolvedValueOnce(jsonResponse({ url: authorization }))
      .mockResolvedValueOnce(jsonResponse({ status: true }, 200, ['better-auth.session_token=sess_google; Max-Age=604800; Path=/; HttpOnly']));
    await signInWithGoogle(async () => {
      const state = new URL(JSON.parse(String((global.fetch as jest.Mock).mock.calls[1][1].body)).callbackURL).searchParams.get('state');
      return `easybizinvoice://auth/google?code=one-time&state=${state}`;
    });
    const exchange = (global.fetch as jest.Mock).mock.calls[2];
    expect(exchange[0]).toBe('http://127.0.0.1:3001/api/auth/google/mobile-session');
    const exchangeBody = JSON.parse(String(exchange[1].body));
    expect(exchangeBody.code).toBe('one-time');
    expect(exchangeBody.verifier).toEqual(expect.any(String));
    expect(await getCookieHeader()).toBe('better-auth.session_token=sess_google');
  });
});
