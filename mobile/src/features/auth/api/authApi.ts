import { z } from 'zod';
import {
  clearPendingGoogleSignIn,
  googleCallbackKind,
  googleCallbackUrl,
  googleSignInErrorMessage,
  loadPendingGoogleSignIn,
  openGoogleBrowser,
  randomGoogleSecret,
  readExactGoogleReturn,
  savePendingGoogleSignIn,
  sha256Base64Url,
} from '../googleSignIn';
import { apiBase, apiFetch, apiRequest, AuthApiError, clearSessionCookies, parseError, rejectFailedResponse } from './http';

export { AuthApiError };

const meResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1),
  }),
  organisation: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
  membership: z.object({
    role: z.enum(['owner', 'admin', 'accountant', 'member', 'read_only']),
  }),
  permissions: z.array(z.string()).default([]),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

const accountSessionSchema = z.object({
  token: z.string().min(1), createdAt: z.coerce.date(), updatedAt: z.coerce.date(), expiresAt: z.coerce.date(),
  ipAddress: z.string().nullable().optional(), userAgent: z.string().nullable().optional(), current: z.boolean(),
});
export type AccountSession = z.infer<typeof accountSessionSchema>;

export function authErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (
      message.includes('supabase.co') ||
      message.includes('Headers') ||
      message.trim().startsWith('{') ||
      message.includes('_bodyInit')
    ) {
      return "Couldn't reach the account service. Make sure the API is running on port 3001.";
    }
    return message;
  }
  return 'Something went wrong.';
}

export async function getMe(): Promise<MeResponse | null> {
  const response = await apiFetch('/api/me', { method: 'GET' });
  if (response.status === 401) {
    // A server-revoked/expired SecureStore cookie must not trap startup in an
    // unauthorized retry loop. Keep offline credentials, but clear confirmed-invalid ones.
    await clearSessionCookies();
    return null;
  }
  if (!response.ok) {
    await rejectFailedResponse(response);
  }
  return meResponseSchema.parse(await response.json());
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email, redirectTo: 'easybizinvoice://reset-password' }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  await clearSessionCookies();
}

export async function listAccountSessions(): Promise<AccountSession[]> {
  return z.array(accountSessionSchema).parse(await apiRequest('/api/me/sessions'));
}

export async function revokeAccountSession(token: string): Promise<void> {
  await apiRequest('/api/me/sessions/revoke', { method: 'POST', body: JSON.stringify({ token }) });
}

export async function revokeOtherSessions(): Promise<void> {
  await apiRequest('/api/me/sessions/revoke-others', { method: 'POST', body: '{}' });
}

export async function revokeAllSessions(): Promise<void> {
  await apiRequest('/api/me/sessions/revoke-all', { method: 'POST', body: '{}' });
  await clearSessionCookies();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }) });
}

export async function changeEmail(newEmail: string): Promise<void> {
  await apiRequest('/api/auth/change-email', { method: 'POST', body: JSON.stringify({ newEmail, callbackURL: 'easybizinvoice://settings/security' }) });
}

export async function signUpEmail(input: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  await apiRequest('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export class GoogleSignInError extends Error {
  constructor(message: string, readonly code: 'cancelled' | 'denied' | 'disabled' | 'failed') {
    super(message);
    this.name = 'GoogleSignInError';
  }
}

const authProvidersSchema = z.object({ google: z.boolean() }).strict();

export async function getAuthProviders(): Promise<{ google: boolean }> {
  const response = await apiFetch('/api/auth/providers');
  if (!response.ok) return { google: false };
  const parsed = authProvidersSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : { google: false };
}

export async function settleGoogleReturn(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  const callback = readExactGoogleReturn(url);
  if (!callback) return false;
  const message = googleSignInErrorMessage(callback.error, callback.errorDescription);
  if (message) {
    await clearPendingGoogleSignIn();
    throw new GoogleSignInError(message, googleCallbackKind(callback.error, callback.errorDescription) ?? 'failed');
  }
  const pending = await loadPendingGoogleSignIn();
  if (!pending || !callback.code || callback.state !== pending.state) return false;
  const response = await apiFetch('/api/auth/google/mobile-session', {
    method: 'POST',
    body: JSON.stringify({ code: callback.code, state: callback.state, verifier: pending.verifier }),
  });
  await clearPendingGoogleSignIn();
  if (!response.ok) {
    const parsed = await parseError(response);
    throw new AuthApiError(parsed.message, response.status, parsed.code, parsed.requestId);
  }
  return true;
}

export async function signInWithGoogle(open: (url: string) => Promise<string | null> = openGoogleBrowser): Promise<void> {
  const providers = await getAuthProviders();
  if (!providers.google) throw new GoogleSignInError('Google sign-in is not available.', 'disabled');
  const state = randomGoogleSecret();
  const verifier = randomGoogleSecret();
  await savePendingGoogleSignIn({ state, verifier });
  const callbackURL = `${googleCallbackUrl}?state=${encodeURIComponent(state)}`;
  const response = await apiFetch('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      callbackURL,
      errorCallbackURL: callbackURL,
      newUserCallbackURL: callbackURL,
      disableRedirect: true,
      additionalData: { verifierHash: await sha256Base64Url(verifier) },
    }),
  });
  if (!response.ok) {
    await clearPendingGoogleSignIn();
    const parsed = await parseError(response);
    if (parsed.code === 'GOOGLE_SIGN_IN_DISABLED') {
      throw new GoogleSignInError('Google sign-in is not available.', 'disabled');
    }
    throw new AuthApiError(parsed.message, response.status, parsed.code, parsed.requestId);
  }
  const body = z.object({ url: z.string().url() }).parse(await response.json());
  const proxy = `${apiBase()}/api/auth/google/browser?authorizationURL=${encodeURIComponent(body.url)}`;
  const returned = await open(proxy);
  if (!returned) {
    await clearPendingGoogleSignIn();
    throw new GoogleSignInError('Google sign-in was cancelled.', 'cancelled');
  }
  if (!(await settleGoogleReturn(returned))) {
    await clearPendingGoogleSignIn();
    throw new GoogleSignInError('Google sign-in did not finish. Try again.', 'failed');
  }
}

export async function signInEmail(input: { email: string; password: string }): Promise<void> {
  await apiRequest('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function signOutSession(): Promise<void> {
  try {
    // apiFetch always sends Content-Type: application/json, and Better Auth parses the body as
    // JSON whenever that header is set. An empty body is rejected with 400 "Invalid JSON in
    // request body", so send an empty JSON object to get the session revoked on the server.
    await apiRequest('/api/auth/sign-out', { method: 'POST', body: '{}' });
  } finally {
    await clearSessionCookies();
  }
}

export async function deleteAccount(input: { password: string; confirmation: 'DELETE' }): Promise<{ deleted: true; deletedAt: string }> {
  const response = await apiRequest<{ deleted: true; deletedAt: string }>('/api/me', {
    method: 'DELETE',
    body: JSON.stringify(input),
  });
  await clearSessionCookies();
  return response;
}
