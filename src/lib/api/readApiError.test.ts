import { describe, expect, it } from 'vitest';
import { readApiFailure } from '@/lib/api/readApiError';

function jsonResponse(body: unknown, status = 500) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Internal Server Error',
    json: async () => body,
  } as Response;
}

describe('readApiFailure', () => {
  it('keeps the API request id, code, and message', async () => {
    const failure = await readApiFailure(
      jsonResponse({
        error: { code: 'INTERNAL', message: 'Ledger write failed', requestId: 'req_123' },
        password: 'hunter2',
      }),
    );

    expect(failure).toEqual({
      message: 'Something went wrong on our side. Ref: req_123',
      status: 500,
      code: 'INTERNAL',
      requestId: 'req_123',
    });
  });

  it('falls back to the status text when the body is not JSON', async () => {
    const response = {
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response;

    await expect(readApiFailure(response)).resolves.toEqual({
      message: 'Something went wrong on our side.',
      status: 502,
    });
  });

  it('drops a request id that is not a short token', async () => {
    const failure = await readApiFailure(
      jsonResponse({ error: { message: 'No', requestId: 'has spaces' } }, 400),
    );
    expect(failure.requestId).toBeUndefined();
    expect(failure.message).toBe(
      "Something in your details didn't save. Please try again, and contact support if it keeps happening.",
    );
  });
});
