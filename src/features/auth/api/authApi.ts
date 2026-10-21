import { meResponseSchema, type MeResponse } from '@ledgercraft/contracts';
import { friendlyApiText } from '@/lib/apiErrorCopy';

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string; requestId?: string };
      message?: string;
    };
    const message = body.error?.message ?? body.message ?? response.statusText;
    if (!body.error?.code) return message;
    console.error('API request failed', {
      status: response.status,
      code: body.error.code,
      requestId: body.error.requestId,
      message,
    });
    return friendlyApiText({
      status: response.status,
      code: body.error.code,
      message,
      requestId: body.error.requestId,
    });
  } catch {
    return response.statusText;
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
    throw new AuthApiError(await parseError(response), response.status);
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
    throw new AuthApiError(await parseError(response), response.status);
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
