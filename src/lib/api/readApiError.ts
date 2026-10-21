import { friendlyApiText } from '@/lib/apiErrorCopy';
import { noteApiFailure } from '@/lib/sentry/noteApiFailure';
import { isRequestId } from '@/lib/sentry/requestId';

export type ApiFailure = {
  message: string;
  status: number;
  code?: string;
  requestId?: string;
};

export async function readApiFailure(response: Response): Promise<ApiFailure> {
  let rawMessage = response.statusText || 'Request failed';
  let code: string | undefined;
  let requestId: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown; code?: unknown; requestId?: unknown };
      message?: unknown;
    };
    if (typeof body.error?.message === 'string') rawMessage = body.error.message;
    else if (typeof body.message === 'string') rawMessage = body.message;
    if (typeof body.error?.code === 'string') code = body.error.code;
    if (isRequestId(body.error?.requestId)) requestId = body.error.requestId;
  } catch {
    // Non-JSON error bodies keep the HTTP status text.
  }
  console.error('API request failed', {
    status: response.status,
    code,
    requestId,
    message: rawMessage,
  });
  noteApiFailure({ status: response.status, code, requestId });
  return {
    message: friendlyApiText({ status: response.status, code, message: rawMessage, requestId }),
    status: response.status,
    code,
    requestId,
  };
}
