import { AppState, Linking } from 'react-native';

const callbackPrefix = 'easybizinvoice://auth/google';

export type GoogleCallback = {
  cookie: string | null;
  error: string | null;
  errorDescription: string | null;
};

export function readGoogleCallback(url: string): GoogleCallback | null {
  if (!url.startsWith(callbackPrefix)) return null;
  const queryIndex = url.indexOf('?');
  const params = new URLSearchParams(queryIndex >= 0 ? url.slice(queryIndex + 1) : '');
  return {
    cookie: params.get('cookie'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
  };
}

export function splitSetCookieHeader(header: string): string[] {
  return header.split(/,(?=\s*[^;,\s]+=)/).map((part) => part.trim()).filter(Boolean);
}

export function googleSignInErrorMessage(error: string | null, description?: string | null): string | null {
  if (!error) return null;
  const code = error.toLowerCase();
  const detail = (description ?? '').toLowerCase();
  if (code === 'access_denied' && detail.includes('denied')) return 'Google sign-in was denied.';
  if (code === 'access_denied' || code === 'cancelled' || code === 'user_cancelled') return 'Google sign-in was cancelled.';
  if (code === 'google_sign_in_disabled' || code === 'oauth_provider_not_found') return 'Google sign-in is not available.';
  if (code === 'unable_to_get_user_info' || code === 'email_not_verified') return 'Google did not confirm this email address.';
  if (code === 'account_not_linked' || code === 'unable_to_link_account') return 'This Google account could not be linked. Sign in with your email and password.';
  return 'Google sign-in did not finish. Try again.';
}

export function googleCallbackKind(error: string | null, description?: string | null): 'cancelled' | 'denied' | 'disabled' | 'failed' | null {
  const message = googleSignInErrorMessage(error, description);
  if (!message) return null;
  if (message.includes('cancelled')) return 'cancelled';
  if (message.includes('denied')) return 'denied';
  if (message.includes('not available')) return 'disabled';
  return 'failed';
}

export function openGoogleBrowser(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (cancelTimer) clearTimeout(cancelTimer);
      subscription.remove();
      appState.remove();
      resolve(value);
    };
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url.startsWith(callbackPrefix)) finish(event.url);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      cancelTimer = setTimeout(() => finish(null), 1200);
    });
    Linking.openURL(url).catch(() => finish(null));
  });
}

export const googleCallbackUrl = callbackPrefix;
