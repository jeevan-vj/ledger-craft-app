import { describe, expect, it } from 'vitest';
import { googleCallbackDestination, googleSignInErrorMessage } from './googleSignIn';

describe('google sign-in callback errors', () => {
  it('distinguishes a cancelled Google prompt from a denied consent', () => {
    expect(googleSignInErrorMessage('access_denied', null)).toBe('Google sign-in was cancelled.');
    expect(googleSignInErrorMessage('cancelled', null)).toBe('Google sign-in was cancelled.');
    expect(googleSignInErrorMessage('access_denied', 'The user denied the request')).toBe('Google sign-in was denied.');
  });

  it('names a disabled provider and an unverified email without echoing the query', () => {
    expect(googleSignInErrorMessage('GOOGLE_SIGN_IN_DISABLED', null)).toBe('Google sign-in is not available.');
    expect(googleSignInErrorMessage('oauth_provider_not_found', null)).toBe('Google sign-in is not available.');
    expect(googleSignInErrorMessage('unable_to_get_user_info', null)).toBe('Google did not confirm this email address.');
    expect(googleSignInErrorMessage('state_mismatch', 'secret-state')).toBe('Google sign-in did not finish. Try again.');
    expect(googleSignInErrorMessage(null, null)).toBeNull();
  });

  it('sends a new Google user to onboarding and everyone else home', () => {
    expect(googleCallbackDestination('/onboarding')).toBe('/onboarding');
    expect(googleCallbackDestination('/')).toBe('/');
    expect(googleCallbackDestination('https://attacker.example')).toBe('/');
    expect(googleCallbackDestination(null)).toBe('/');
  });
});
