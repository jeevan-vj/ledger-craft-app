export type ApiFailure = {
  status: number;
  code?: string;
  message?: string;
  requestId?: string;
};

/** Product messages written for people, not schema diagnostics. */
const USER_FACING_CODES = new Set([
  'HTTP_ERROR',
  'NOT_FOUND',
  'customer_email_required',
  'PAYMENT_EXCEEDS_BALANCE',
  'RECONCILIATION_UNBALANCED',
  'IDEMPOTENCY_CONFLICT',
  'FILE_TOO_LARGE',
  'EMAIL_UNAVAILABLE',
  'SHARE_INACTIVE',
]);

export const validationFailureCopy =
  "Something in your details didn't save. Please try again, and contact support if it keeps happening.";

export const serverFailureCopy = 'Something went wrong on our side.';

export const answersKeptCopy = 'Your answers are still here.';

export function isSchemaDiagnostic(message: string): boolean {
  return /(?:^|;\s*)[\w.]+:\s+\S/.test(message)
    || /Invalid enum value/.test(message)
    || /Request validation failed/.test(message)
    || /expected\s+.+\s+received/i.test(message);
}

function failureBody(failure: ApiFailure): string {
  const message = failure.message?.trim() ?? '';
  const safeUserMessage = message.length > 0 && !isSchemaDiagnostic(message);

  if (failure.status === 0) return 'Check your connection and try again.';
  if (failure.code === 'EMAIL_UNAVAILABLE' && safeUserMessage) return message;
  if (failure.status >= 500) return serverFailureCopy;
  if (failure.status === 401 || failure.code === 'UNAUTHORIZED') return 'Please sign in again.';
  if (failure.status === 403 || failure.code === 'FORBIDDEN') return "You don't have access to do that.";
  if (
    failure.code
    && failure.code !== 'VALIDATION_ERROR'
    && USER_FACING_CODES.has(failure.code)
    && safeUserMessage
  ) {
    return message;
  }
  return validationFailureCopy;
}

export function friendlyApiText(failure: ApiFailure, options?: { keepAnswers?: boolean }): string {
  let text = failureBody(failure);
  if (!/[.!?]$/.test(text)) text = `${text}.`;
  if (options?.keepAnswers && !text.endsWith(answersKeptCopy)) {
    text = `${text} ${answersKeptCopy}`;
  }
  if (failure.requestId && failure.status !== 0) {
    text = `${text} Ref: ${failure.requestId}`;
  }
  return text;
}

export async function presentResponseError(response: Response): Promise<{
  message: string;
  code?: string;
  requestId?: string;
}> {
  let message = response.statusText || 'Request failed';
  let code: string | undefined;
  let requestId: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string; requestId?: string };
      message?: string;
    };
    message = body.error?.message ?? body.message ?? message;
    code = body.error?.code;
    requestId = body.error?.requestId;
  } catch {
    // Non-JSON bodies keep the status text.
  }
  console.error('API request failed', { status: response.status, code, requestId, message });
  return {
    message: friendlyApiText({ status: response.status, code, message, requestId }),
    code,
    requestId,
  };
}
