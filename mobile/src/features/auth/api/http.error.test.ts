import { captureApiError } from '@/observability/sentry';
import { AuthApiError, readApiError, rejectFailedResponse } from './http';

jest.mock('@/observability/sentry', () => ({
  captureApiError: jest.fn(),
}));

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('API error request ids', () => {
  beforeEach(() => {
    jest.mocked(captureApiError).mockClear();
  });

  it('reads the server request id without keeping the response body', async () => {
    const parsed = await readApiError(jsonResponse({
      error: { message: 'Invoice failed', requestId: ' req_123 ', detail: 'raw body' },
    }, 500));

    expect(parsed).toEqual({ message: 'Invoice failed', requestId: 'req_123' });
    expect(parsed).not.toHaveProperty('detail');
  });

  it('reports server and network failures with the request id tag', async () => {
    await expect(rejectFailedResponse(jsonResponse({
      error: { message: 'Upstream failed', requestId: 'req_500' },
    }, 500))).rejects.toMatchObject({
      name: 'AuthApiError',
      message: 'Upstream failed',
      status: 500,
      requestId: 'req_500',
    });

    expect(captureApiError).toHaveBeenCalledWith(expect.any(AuthApiError), 500, 'req_500');
  });

  it('keeps the request id on client errors without reporting them', async () => {
    await expect(rejectFailedResponse(jsonResponse({
      error: { message: 'Check the form', requestId: 'req_400' },
    }, 400))).rejects.toMatchObject({ status: 400, requestId: 'req_400' });

    expect(captureApiError).not.toHaveBeenCalled();
  });
});
