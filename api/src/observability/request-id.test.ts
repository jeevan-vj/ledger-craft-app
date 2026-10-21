import { describe, expect, it } from 'vitest';
import { bindRequestId, failureResponse, resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('reuses the incoming request id', () => {
    expect(resolveRequestId('req_from_caller')).toBe('req_from_caller');
  });

  it('mints a req_ id when the header is missing, blank, or has a newline', () => {
    expect(resolveRequestId(null)).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(resolveRequestId('   ')).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(resolveRequestId('req_bad\ninjection')).toMatch(/^req_[0-9a-f-]{36}$/);
  });
});

describe('failureResponse', () => {
  it('returns the standard envelope and echoes the same request id', async () => {
    const response = failureResponse(503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable. Please try again later.', 'req_same');
    expect(response.status).toBe(503);
    expect(response.headers.get('x-request-id')).toBe('req_same');
    expect(await response.json()).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable. Please try again later.',
        requestId: 'req_same',
      },
    });
  });
});

describe('bindRequestId', () => {
  it('copies a missing request id onto the forwarded request', () => {
    const bound = bindRequestId(new Request('https://example.test/api/healthz'));
    expect(bound.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(bound.request.headers.get('x-request-id')).toBe(bound.requestId);
  });

  it('keeps the caller request when forwarding', () => {
    const bound = bindRequestId(
      new Request('https://example.test/api/me', { headers: { 'x-request-id': 'req_incoming' } }),
    );
    expect(bound.requestId).toBe('req_incoming');
    expect(bound.request.headers.get('x-request-id')).toBe('req_incoming');
    expect(bound.request.url).toBe('https://example.test/api/me');
  });
});
