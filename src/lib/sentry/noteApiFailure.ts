import { rememberApiFailure } from '@/lib/sentry/buffer';

export function noteApiFailure(failure: { status: number; code?: string; requestId?: string }): void {
  rememberApiFailure(failure);
}
