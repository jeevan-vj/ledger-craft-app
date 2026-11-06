import { accountSessionListSchema, deleteAccountResponseSchema, meResponseSchema, type AccountSession, type DeleteAccountRequest, type DeleteAccountResponse, type MeResponse } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export class AuthApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.requestId = requestId;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new AuthApiError(failure.message, failure.status, failure.requestId);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function getMe(): Promise<MeResponse | null> {
  const response = await fetch('/api/me', { credentials: 'include' });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new AuthApiError(failure.message, failure.status, failure.requestId);
  }
  return meResponseSchema.parse(await response.json());
}

export async function signUpEmail(input: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  await request('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function signInEmail(input: { email: string; password: string }): Promise<void> {
  await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function signOutSession(): Promise<void> {
  await request('/api/auth/sign-out', { method: 'POST' });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request('/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function listAccountSessions(): Promise<AccountSession[]> {
  return accountSessionListSchema.parse(await request('/api/me/sessions'));
}

export async function revokeAccountSession(token: string): Promise<void> {
  await request('/api/me/sessions/revoke', { method: 'POST', body: JSON.stringify({ token }) });
}

export async function revokeOtherSessions(): Promise<void> {
  await request('/api/me/sessions/revoke-others', { method: 'POST', body: '{}' });
}

export async function revokeAllSessions(): Promise<void> {
  await request('/api/me/sessions/revoke-all', { method: 'POST', body: '{}' });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }),
  });
}

export async function changeEmail(newEmail: string): Promise<void> {
  await request('/api/auth/change-email', {
    method: 'POST',
    body: JSON.stringify({ newEmail, callbackURL: `${window.location.origin}/settings?tab=account` }),
  });
}

export async function deleteAccount(input: DeleteAccountRequest): Promise<DeleteAccountResponse> {
  return deleteAccountResponseSchema.parse(await request('/api/me', { method: 'DELETE', body: JSON.stringify(input) }));
}
