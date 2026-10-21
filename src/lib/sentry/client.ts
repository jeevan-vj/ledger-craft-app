import { addBreadcrumb, captureException, init, setTag, setUser, withScope } from '@sentry/react';
import { bindSentryLive, type QueuedApiFailure } from '@/lib/sentry/buffer';
import { requestIdOf } from '@/lib/sentry/requestId';
import { scrubSentryBreadcrumb, scrubSentryEvent } from '@/lib/sentry/scrub';
import type { SentryStart } from '@/lib/sentry/init';

function envValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

function releaseName(start?: SentryStart): string | undefined {
  const configured = start?.release ?? envValue(import.meta.env.VITE_SENTRY_RELEASE);
  const release = configured || envValue(import.meta.env.VITE_BUILD_HASH) || envValue(import.meta.env.VITE_APP_VERSION);
  const trimmed = release.trim();
  return trimmed || undefined;
}

function report(error: unknown, componentStack?: string | null): string | undefined {
  return withScope((scope) => {
    const requestId = requestIdOf(error);
    if (requestId) scope.setTag('requestId', requestId);
    if (componentStack) scope.setContext('react', { componentStack });
    return captureException(error);
  });
}

function crumb(failure: QueuedApiFailure): void {
  const data: Record<string, string | number> = { status: failure.status };
  if (failure.code) data.code = failure.code;
  if (failure.requestId) data.requestId = failure.requestId;
  addBreadcrumb({
    category: 'api',
    level: failure.status >= 500 ? 'error' : 'info',
    message: failure.code ? `${failure.status} ${failure.code}` : `HTTP ${failure.status}`,
    data,
  });
}

export function startSentry(start: SentryStart & { dsn: string }): void {
  init({
    dsn: start.dsn,
    environment: start.environment ?? import.meta.env.MODE,
    release: releaseName(start),
    // @sentry/react 11 replaced sendDefaultPii with dataCollection. These switches
    // keep automatic user details, cookies, headers, bodies, and local variables off.
    // Tracing, Replay, and Feedback stay out of this bundle.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: { deny: ['token', 'shareToken', 'share_token', 'email'] },
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
    integrations: (defaults) => defaults.filter((integration) => !/replay|feedback/i.test(integration.name)),
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  });
  setTag('app.version', envValue(import.meta.env.VITE_APP_VERSION) || 'unknown');
  setTag('build.hash', envValue(import.meta.env.VITE_BUILD_HASH) || 'unknown');
  bindSentryLive({
    report,
    user: (userId) => setUser(userId ? { id: userId } : null),
    crumb,
  });
}
