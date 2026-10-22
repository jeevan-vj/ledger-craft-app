import { createErrorEnvelope } from '@ledgercraft/contracts';

const MAX_REQUEST_ID_LENGTH = 200;

/** Reuse a caller-supplied request id, or mint one in the same shape as the Hono middleware. */
export function resolveRequestId(incoming: string | null | undefined): string {
  const value = incoming?.trim() ?? '';
  if (value.length > 0 && value.length <= MAX_REQUEST_ID_LENGTH && !/[\r\n]/.test(value)) return value;
  return `req_${crypto.randomUUID()}`;
}

export function bindRequestId(request: Request): { request: Request; requestId: string } {
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  if (request.headers.get('x-request-id') === requestId) return { request, requestId };
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  return { request: new Request(request, { headers }), requestId };
}

export function failureResponse(status: number, code: string, message: string, requestId: string): Response {
  return Response.json(createErrorEnvelope(code, message, requestId), {
    status,
    headers: { 'x-request-id': requestId },
  });
}
