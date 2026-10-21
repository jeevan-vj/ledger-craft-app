const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value);
}

export function requestIdOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('requestId' in error)) return undefined;
  const value = (error as { requestId?: unknown }).requestId;
  return isRequestId(value) ? value : undefined;
}
