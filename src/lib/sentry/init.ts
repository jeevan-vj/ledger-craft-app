import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import {
  rememberUser,
  reportOrQueue,
  sentryState,
  setSentryState,
} from '@/lib/sentry/buffer';

export type SentryStart = {
  dsn?: string;
  release?: string;
  environment?: string;
};

function envValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

let loadPromise: Promise<void> | undefined;

function bundledClient(): Promise<typeof import('./client') | null> {
  // Keep these checks separate. Vite drops the import() when the branch is statically false,
  // so a production build without VITE_SENTRY_DSN does not emit the SDK chunk.
  if (import.meta.env.VITE_SENTRY_DSN) {
    return import('./client');
  }
  if (import.meta.env.MODE === 'test') {
    return import('./client');
  }
  return Promise.resolve(null);
}

function afterFirstPaint(): Promise<void> {
  if (import.meta.env.MODE === 'test') return Promise.resolve();
  return new Promise((resolve) => {
    const idle = window.requestIdleCallback?.bind(window);
    if (idle) {
      idle(() => resolve(), { timeout: 2000 });
      return;
    }
    window.setTimeout(resolve, 1);
  });
}

function installEarlyHandlers(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onError = (event: Event) => {
    const errorEvent = event as ErrorEvent;
    reportOrQueue(errorEvent.error ?? errorEvent.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportOrQueue(event.reason);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

export function isSentryEnabled(): boolean {
  return sentryState() === 'ready';
}

export function initSentry(start?: SentryStart): Promise<void> {
  if (sentryState() === 'disabled') return Promise.resolve();
  if (loadPromise) return loadPromise;
  const dsn = (start?.dsn ?? envValue(import.meta.env.VITE_SENTRY_DSN)).trim();
  if (!dsn) {
    setSentryState('disabled');
    return Promise.resolve();
  }

  setSentryState('loading');
  const detach = installEarlyHandlers();
  loadPromise = afterFirstPaint()
    .then(() => bundledClient())
    .then((client) => {
      detach();
      if (!client) {
        setSentryState('disabled');
        return;
      }
      client.startSentry({ ...start, dsn });
      setSentryState('ready');
    })
    .catch((error: unknown) => {
      detach();
      setSentryState('disabled');
      console.error('Sentry failed to start', error);
    });
  return loadPromise;
}

export function setSentryUser(userId: string | null): void {
  rememberUser(userId);
}

export function captureAppError(error: unknown, componentStack?: string | null): string | undefined {
  return reportOrQueue(error, componentStack);
}

export function createSentryBrowserRouter(routes: RouteObject[]) {
  return createBrowserRouter(routes);
}
