import { googleCallbackKind, googleSignInErrorMessage, readGoogleCallback, splitSetCookieHeader } from './googleSignIn';

describe('google callback parsing', () => {
  it('reads the session cookie and distinguishes cancel, deny, and a disabled provider', () => {
    const cookie = 'better-auth.session_token=sess_google; Max-Age=604800; Path=/; HttpOnly';
    const parsed = readGoogleCallback(`easybizinvoice://auth/google?cookie=${encodeURIComponent(cookie)}`);
    expect(parsed?.cookie).toBe(cookie);
    expect(splitSetCookieHeader(cookie)).toEqual([cookie]);
    expect(readGoogleCallback('easybizinvoice://invoices/1')).toBeNull();
    expect(googleSignInErrorMessage('access_denied', null)).toBe('Google sign-in was cancelled.');
    expect(googleCallbackKind('access_denied', 'The user denied the request')).toBe('denied');
    expect(googleCallbackKind('oauth_provider_not_found', null)).toBe('disabled');
    expect(googleSignInErrorMessage('unable_to_get_user_info', null)).toMatch(/confirm this email/);
  });
});
