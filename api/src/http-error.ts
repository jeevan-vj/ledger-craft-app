import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function apiError(status: ContentfulStatusCode, code: string, message: string): HTTPException {
  return new HTTPException(status, { message, cause: { code } });
}

export function errorCodeFromCause(cause: unknown, fallback: string): string {
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    const code = (cause as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return fallback;
}
