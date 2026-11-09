import { AppState, Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const googleCallbackUrl = 'easybizinvoice://auth/google';
const pendingKey = 'ledgercraft.google.pending';

export type GoogleReturn = {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
};

export type PendingGoogleSignIn = {
  state: string;
  verifier: string;
  expiresAt?: number;
};

let pendingMemory: PendingGoogleSignIn | null = null;

export function readExactGoogleReturn(url: string): GoogleReturn | null {
  const withoutHash = url.split('#')[0] ?? '';
  const queryIndex = withoutHash.indexOf('?');
  const path = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  if (path !== googleCallbackUrl) return null;
  const params = new URLSearchParams(queryIndex === -1 ? '' : withoutHash.slice(queryIndex + 1));
  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
  };
}

export const googlePendingTtlMs = 2 * 60 * 1000;

type StoredPending = PendingGoogleSignIn & { expiresAt: number };

function storedPending(value: string | null): StoredPending | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredPending;
    if (!parsed.state || !parsed.verifier || typeof parsed.expiresAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePendingGoogleSignIn(pending: PendingGoogleSignIn): Promise<void> {
  const expiresAt = pending.expiresAt ?? Date.now() + googlePendingTtlMs;
  if (expiresAt <= Date.now()) {
    await clearPendingGoogleSignIn();
    return;
  }
  const stored: StoredPending = { state: pending.state, verifier: pending.verifier, expiresAt };
  pendingMemory = stored;
  await SecureStore.setItemAsync(pendingKey, JSON.stringify(stored));
}

export async function loadPendingGoogleSignIn(): Promise<PendingGoogleSignIn | null> {
  const stored = pendingMemory?.expiresAt ? pendingMemory as StoredPending : storedPending(await SecureStore.getItemAsync(pendingKey));
  if (!stored || stored.expiresAt <= Date.now()) {
    if (stored) await clearPendingGoogleSignIn();
    return null;
  }
  pendingMemory = stored;
  return stored;
}

export async function clearPendingGoogleSignIn(): Promise<void> {
  pendingMemory = null;
  await SecureStore.deleteItemAsync(pendingKey);
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
  if (code === 'state_mismatch' || code === 'state_not_found' || code === 'invalid_code') return 'Google sign-in did not finish. Try again.';
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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function randomGoogleSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return bytesToBase64Url(digest);
}

export function openGoogleBrowser(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (cancelTimer) clearTimeout(cancelTimer);
      clearTimeout(expiry);
      subscription.remove();
      appState.remove();
      resolve(value);
    };
    const expiry = setTimeout(() => finish(null), googlePendingTtlMs);
    const subscription = Linking.addEventListener('url', (event) => {
      if (readExactGoogleReturn(event.url)) finish(event.url);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      cancelTimer = setTimeout(() => finish(null), 1200);
    });
    Linking.openURL(url).catch(() => finish(null));
  });
}
