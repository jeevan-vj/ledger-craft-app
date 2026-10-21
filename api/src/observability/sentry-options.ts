import { scrubBreadcrumb, scrubSentryEvent, type ScrubbableBreadcrumb, type ScrubbableEvent } from './scrub';

export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
export const SENTRY_DEBUG_PATH = '/api/__debug/sentry';

const DSN_PATTERN = /^https:\/\/[^@\s]+@[^/\s]+\/\d+$/;

export type SentryEnv = {
  NODE_ENV?: string;
  SENTRY_DSN?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_DEBUG_ROUTE?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
};

export type SentryClientOptions = {
  enabled: boolean;
  dsn?: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  /** SDK 11 replaced this flag with dataCollection. Kept off so the old restrictive default stays explicit. */
  sendDefaultPii: false;
  dataCollection: {
    userInfo: false;
    cookies: false;
    httpBodies: [];
    urlQueryParams: false;
    databaseQueryData: false;
    stackFrameVariables: false;
    genAI: { inputs: false; outputs: false };
    httpHeaders: {
      request: { deny: string[] };
      response: { deny: string[] };
    };
  };
  rpcTracePropagationBindings?: string[];
  beforeSend: <T extends ScrubbableEvent>(event: T) => T;
  beforeBreadcrumb: <T extends ScrubbableBreadcrumb>(breadcrumb: T) => T;
};

const AUTH_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'set-auth-token',
  'x-auth-token',
  'x-api-key',
];

export function isSentryDebugRouteEnabled(env: Pick<SentryEnv, 'NODE_ENV' | 'SENTRY_DEBUG_ROUTE'>): boolean {
  return env.NODE_ENV !== 'production' && env.SENTRY_DEBUG_ROUTE === 'true';
}

export function readTracesSampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRACES_SAMPLE_RATE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return DEFAULT_TRACES_SAMPLE_RATE;
  return parsed;
}

export function readRelease(env: Pick<SentryEnv, 'SENTRY_RELEASE' | 'CF_VERSION_METADATA'>): string | undefined {
  const configured = env.SENTRY_RELEASE?.trim();
  if (configured) return configured;
  const tag = env.CF_VERSION_METADATA?.tag?.trim();
  if (tag) return tag;
  return undefined;
}

export function sentrySdkOptions(env: SentryEnv): SentryClientOptions {
  const rawDsn = env.SENTRY_DSN?.trim() ?? '';
  const dsn = DSN_PATTERN.test(rawDsn) ? rawDsn : undefined;
  const release = readRelease(env);
  return {
    enabled: Boolean(dsn),
    // An invalid DSN must not be forwarded. An empty string stops the SDK from reading it back off env.
    ...(dsn ? { dsn } : rawDsn ? { dsn: '' } : {}),
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV?.trim() || 'development',
    ...(release ? { release } : {}),
    tracesSampleRate: readTracesSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      httpHeaders: {
        request: { deny: AUTH_HEADERS },
        response: { deny: ['set-cookie', 'set-auth-token', 'authorization'] },
      },
    },
    ...(dsn ? { rpcTracePropagationBindings: ['IDENTITY', 'LEDGERS'] } : {}),
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
