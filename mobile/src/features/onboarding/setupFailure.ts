import { AuthApiError } from '@/features/auth/api/http';

const CONNECTION_MESSAGE = 'Check your connection and try again. Your answers are still here.';

export function setupFailureAlert(error: unknown): { title: string; message: string } {
  const title = 'Couldn’t finish setup';
  if (error instanceof AuthApiError && error.status === 0) {
    return { title, message: CONNECTION_MESSAGE };
  }

  const raw = error instanceof AuthApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : '';
  const detail = raw.trim() || 'We couldn’t save your business setup.';
  const separator = /[.!?]$/.test(detail) ? ' ' : '. ';

  return { title, message: `${detail}${separator}Your answers are still here.` };
}
