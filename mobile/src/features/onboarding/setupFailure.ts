import { AuthApiError } from '@/features/auth/api/http';

const CONNECTION_MESSAGE = 'Check your connection and try again. Your answers are still here.';
const VALIDATION_MESSAGE = "Something in your details didn't save. Please try again, and contact support if it keeps happening.";
const SERVER_MESSAGE = 'Something went wrong on our side.';
const ANSWERS = 'Your answers are still here.';

const USER_FACING_CODES = new Set([
  'HTTP_ERROR',
  'NOT_FOUND',
  'customer_email_required',
  'PAYMENT_EXCEEDS_BALANCE',
  'RECONCILIATION_UNBALANCED',
  'IDEMPOTENCY_CONFLICT',
  'FILE_TOO_LARGE',
  'EMAIL_UNAVAILABLE',
]);

function isSchemaDiagnostic(message: string): boolean {
  return /(?:^|;\s*)[\w.]+:\s+\S/.test(message)
    || /Invalid enum value/.test(message)
    || /Request validation failed/.test(message)
    || /expected\s+.+\s+received/i.test(message);
}

function withAnswers(text: string, requestId?: string): string {
  const sentence = /[.!?]$/.test(text) ? text : `${text}.`;
  const withKeptAnswers = sentence.endsWith(ANSWERS) ? sentence : `${sentence} ${ANSWERS}`;
  return requestId ? `${withKeptAnswers} Ref: ${requestId}` : withKeptAnswers;
}

export function setupFailureAlert(error: unknown): { title: string; message: string } {
  const title = 'Couldn’t finish setup';
  if (error instanceof AuthApiError && error.status === 0) {
    return { title, message: CONNECTION_MESSAGE };
  }

  const status = error instanceof AuthApiError ? error.status : undefined;
  const code = error instanceof AuthApiError ? error.code : undefined;
  const requestId = error instanceof AuthApiError ? error.requestId : undefined;
  const raw = error instanceof AuthApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : '';
  const message = raw.trim();
  const safeUserMessage = message.length > 0 && !isSchemaDiagnostic(message);

  let body = VALIDATION_MESSAGE;
  if (code === 'EMAIL_UNAVAILABLE' && safeUserMessage) body = message;
  else if (status !== undefined && status >= 500) body = SERVER_MESSAGE;
  else if (status === 401 || code === 'UNAUTHORIZED') body = 'Please sign in again.';
  else if (status === 403 || code === 'FORBIDDEN') body = "You don't have access to do that.";
  else if (code && code !== 'VALIDATION_ERROR' && USER_FACING_CODES.has(code) && safeUserMessage) body = message;
  else if (status === undefined && safeUserMessage) body = message;

  return { title, message: withAnswers(body, requestId) };
}
