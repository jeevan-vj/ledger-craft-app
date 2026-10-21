import { noteApiFailure } from '@/lib/sentry/noteApiFailure';
import { isRequestId } from '@/lib/sentry/requestId';

export type ApiFailure = {
  message: string;
  status: number;
  code?: string;
  requestId?: string;
};

export async function readApiFailure(response: Response): Promise<ApiFailure> {
  const failure: ApiFailure = {
    message: response.statusText || 'Request failed',
    status: response.status,
  };
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown; code?: unknown; requestId?: unknown };
      message?: unknown;
    };
    if (typeof body.error?.message === 'string') failure.message = body.error.message;
    else if (typeof body.message === 'string') failure.message = body.message;
    if (typeof body.error?.code === 'string') failure.code = body.error.code;
    if (isRequestId(body.error?.requestId)) failure.requestId = body.error.requestId;
  } catch {
    // Non-JSON error bodies keep the HTTP status text.
  }
  noteApiFailure(failure);
  return failure;
}
