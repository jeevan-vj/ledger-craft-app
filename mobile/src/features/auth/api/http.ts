import { clearCookies, getCookieHeader, rememberSessionToken, rememberSetCookie } from './cookieJar';

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export function apiBase(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
}

function requestOrigin(): string {
  return process.env.EXPO_PUBLIC_APP_ORIGIN ?? 'http://127.0.0.1:8081';
}

function friendlyStatus(status: number): string {
  if (status === 0 || status === 502 || status === 503) {
    return "Can't reach the account service. Make sure the API is running on port 3001.";
  }
  return `Request failed (${status})`;
}

export async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return body.error?.message ?? body.message ?? friendlyStatus(response.status);
  } catch {
    return friendlyStatus(response.status);
  }
}

function mergeHeaders(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: requestOrigin(),
  };
  const extra = init?.headers;
  if (extra && typeof extra === 'object' && !Array.isArray(extra) && !(extra instanceof Headers)) {
    Object.assign(headers, extra);
  }
  return headers;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = await getCookieHeader();
  const headers = mergeHeaders(init);
  if (cookie) {
    headers.Cookie = cookie;
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      credentials: 'omit',
      ...init,
      headers,
    });
  } catch {
    throw new AuthApiError(
      "Can't reach the API. Start it with pnpm dev:api (port 3001).",
      0,
    );
  }

  await rememberSetCookie(response.headers);
  const authToken = response.headers?.get?.('set-auth-token');
  if (authToken) {
    await rememberSessionToken(authToken);
  }
  return response;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (response.status === 204) {
    return undefined as T;
  }
  if (!response.ok) {
    throw new AuthApiError(await parseError(response), response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
}

export async function clearSessionCookies(): Promise<void> {
  await clearCookies();
}
