export function googleSignInErrorMessage(error: string | null, description?: string | null): string | null {
  if (!error) return null;
  const code = error.toLowerCase();
  const detail = (description ?? '').toLowerCase();
  if (code === 'access_denied' && detail.includes('denied')) return 'Google sign-in was denied.';
  if (code === 'access_denied' || code === 'cancelled' || code === 'user_cancelled') return 'Google sign-in was cancelled.';
  if (code === 'google_sign_in_disabled' || code === 'oauth_provider_not_found') return 'Google sign-in is not available.';
  if (code === 'unable_to_get_user_info' || code === 'email_not_verified') return 'Google did not confirm this email address.';
  if (code === 'account_not_linked' || code === 'unable_to_link_account') return 'This Google account could not be linked. Sign in with your email and password.';
  if (code === 'state_mismatch' || code === 'state_not_found' || code === 'invalid_code') return 'Google sign-in did not finish. Try again.';
  return 'Google sign-in did not finish. Try again.';
}

export function googleCallbackDestination(next: string | null): '/' | '/onboarding' {
  return next === '/onboarding' ? '/onboarding' : '/';
}
