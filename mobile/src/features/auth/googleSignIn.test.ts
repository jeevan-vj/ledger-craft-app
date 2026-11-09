import { clearPendingGoogleSignIn, googleSignInErrorMessage, readExactGoogleReturn, savePendingGoogleSignIn } from './googleSignIn';
import { settleGoogleReturn } from './api/authApi';
import { clearCookies, getCookieHeader } from './api/cookieJar';

describe('google callback parsing', () => {
  it('matches only the exact return path and maps denied and state mismatch', () => {
    expect(readExactGoogleReturn('easybizinvoice://auth/google?code=one&state=two')?.code).toBe('one');
    expect(readExactGoogleReturn('easybizinvoice://auth/googleish?cookie=secret')).toBeNull();
    expect(readExactGoogleReturn('easybizinvoice://auth/google/extra?code=one')).toBeNull();
    expect(googleSignInErrorMessage('access_denied', null)).toBe('Google sign-in was cancelled.');
    expect(googleSignInErrorMessage('access_denied', 'The user denied the request')).toBe('Google sign-in was denied.');
    expect(googleSignInErrorMessage('state_mismatch', null)).toBe('Google sign-in did not finish. Try again.');
  });

  it('does not store a session from a cold-start URL', async () => {
    await clearPendingGoogleSignIn();
    await clearCookies();
    global.fetch = jest.fn();
    await expect(settleGoogleReturn('easybizinvoice://auth/google?cookie=better-auth.session_token%3Dsecret')).resolves.toBe(false);
    await expect(settleGoogleReturn('easybizinvoice://auth/google?code=planted&state=attacker')).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await getCookieHeader()).toBeNull();
  });

  it('refuses a return whose state does not match the one stored before the browser opened', async () => {
    await clearCookies();
    global.fetch = jest.fn();
    await savePendingGoogleSignIn({ state: 'expected-state', verifier: 'verifier' });
    await expect(settleGoogleReturn('easybizinvoice://auth/google?code=one&state=other-state')).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await getCookieHeader()).toBeNull();
    await clearPendingGoogleSignIn();
  });
});
