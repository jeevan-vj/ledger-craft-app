import * as Sentry from '@sentry/react';
import { isSentryEnabled } from '@/lib/sentry/init';

export function noteApiFailure(failure: { status: number; code?: string; requestId?: string }): void {
  if (!isSentryEnabled()) return;
  const data: Record<string, string | number> = { status: failure.status };
  if (failure.code) data.code = failure.code;
  if (failure.requestId) data.requestId = failure.requestId;
  Sentry.addBreadcrumb({
    category: 'api',
    level: failure.status >= 500 ? 'error' : 'info',
    message: failure.code ? `${failure.status} ${failure.code}` : `HTTP ${failure.status}`,
    data,
  });
}
