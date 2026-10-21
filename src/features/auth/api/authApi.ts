import { meResponseSchema, type MeResponse } from '@ledgercraft/contracts';
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
