import * as Sentry from '@sentry/react';
import {
  createBrowserRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
  type RouteObject,
} from 'react-router-dom';
import { requestIdOf } from '@/lib/sentry/requestId';
import { scrubSentryBreadcrumb, scrubSentryEvent } from '@/lib/sentry/scrub';

type SentryState = 'idle' | 'ready' | 'disabled';

let state: SentryState = 'idle';

export type SentryStart = {
  dsn?: string;
  release?: string;
  tracesSampleRate?: string;
  environment?: string;
};

function envValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

export function readTracesSampleRate(raw: string | undefined): number {
  const value = raw?.trim() ?? '';
  if (!value) return 0.1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0.1;
  return parsed;
}

function releaseName(start?: SentryStart): string | undefined {
  const configured = start?.release ?? envValue(import.meta.env.VITE_SENTRY_RELEASE);
  const release = configured || envValue(import.meta.env.VITE_BUILD_HASH) || envValue(import.meta.env.VITE_APP_VERSION);
  const trimmed = release.trim();
  return trimmed || undefined;
}

export function isSentryEnabled(): boolean {
  return state === 'ready';
}

export function initSentry(start?: SentryStart): void {
  if (state !== 'idle') return;
  const dsn = (start?.dsn ?? envValue(import.meta.env.VITE_SENTRY_DSN)).trim();
  if (!dsn) {
    state = 'disabled';
    return;
  }

  const release = releaseName(start);
  Sentry.init({
    dsn,
    environment: start?.environment ?? import.meta.env.MODE,
    release,
    // @sentry/react 11 replaced sendDefaultPii with dataCollection. These switches
    // keep automatic user details, cookies, headers, bodies, and local variables off.
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
    tracesSampleRate: readTracesSampleRate(start?.tracesSampleRate ?? import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE),
    tracePropagationTargets: ['localhost', /^\//],
    integrations: (defaults) => [
      ...defaults.filter((integration) => !/replay/i.test(integration.name)),
      Sentry.reactRouterBrowserTracingIntegration({
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: (event) => scrubSentryEvent(event as unknown as Parameters<typeof scrubSentryEvent>[0]),
    beforeBreadcrumb: scrubSentryBreadcrumb,
  });
  Sentry.setTag('app.version', envValue(import.meta.env.VITE_APP_VERSION) || 'unknown');
  Sentry.setTag('build.hash', envValue(import.meta.env.VITE_BUILD_HASH) || 'unknown');
  state = 'ready';
}

export function setSentryUser(userId: string | null): void {
  if (!isSentryEnabled()) return;
  if (userId) {
    Sentry.setUser({ id: userId });
    return;
  }
  Sentry.setUser(null);
}

export function captureAppError(error: unknown, componentStack?: string | null): string | undefined {
  if (!isSentryEnabled()) return undefined;
  return Sentry.withScope((scope) => {
    const requestId = requestIdOf(error);
    if (requestId) scope.setTag('requestId', requestId);
    if (componentStack) scope.setContext('react', { componentStack });
    return Sentry.captureException(error);
  });
}

export function createSentryBrowserRouter(routes: RouteObject[]) {
  const createRouter = isSentryEnabled()
    ? Sentry.wrapCreateBrowserRouter(createBrowserRouter)
    : createBrowserRouter;
  return createRouter(routes);
}
