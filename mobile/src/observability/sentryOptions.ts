import { scrubBreadcrumb, scrubSentryEvent, type ScrubbableBreadcrumb, type ScrubbableEvent } from './scrub';

export const TRACES_SAMPLE_RATE = 0.1;

export interface ReleaseIdentity {
  applicationId?: string;
  version?: string;
  build?: string;
}

export function normalizeSentryDsn(value: string | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function readSentryDsn(): string {
  return normalizeSentryDsn(process.env.EXPO_PUBLIC_SENTRY_DSN);
}

export function formatRelease(identity: ReleaseIdentity): { release?: string; dist?: string } {
  const applicationId = identity.applicationId?.trim() || 'com.easybizinvoice.app';
  const version = identity.version?.trim();
  const build = identity.build?.trim();
  if (!version || !build) return {};
  return {
    release: `${applicationId}@${version}+${build}`,
    dist: build,
  };
}

export function toSentryUser(userId: string | null | undefined): { id: string } | null {
  const id = userId?.trim();
  if (!id) return null;
  return { id };
}

export function shouldReportApiStatus(status: number): boolean {
  return status === 0 || status >= 500;
}

export function apiErrorTags(status: number, requestId?: string): Record<string, string> {
  const tags: Record<string, string> = {
    source: 'api',
    'http.status': String(status),
  };
  if (requestId?.trim()) tags.requestId = requestId.trim();
  return tags;
}

export interface NamedIntegration {
  name: string;
}

export function selectSentryIntegrations<T extends NamedIntegration>(defaults: T[], extras: T[]): T[] {
  const kept = defaults.filter((integration) => integration.name !== 'MobileReplay' && integration.name !== 'Breadcrumbs');
  return [...kept, ...extras];
}

export interface SentryInitOptions {
  dsn: string;
  sendDefaultPii: false;
  tracesSampleRate: number;
  enableCaptureFailedRequests: false;
  attachScreenshot: false;
  enableLogs: false;
  release?: string;
  dist?: string;
  integrations: unknown;
  beforeSend: (event: ScrubbableEvent) => ScrubbableEvent | null;
  beforeBreadcrumb: (breadcrumb: ScrubbableBreadcrumb) => ScrubbableBreadcrumb | null;
}

export function buildSentryInitOptions(input: {
  dsn: string;
  release?: string;
  dist?: string;
  integrations: unknown;
}): SentryInitOptions {
  return {
    dsn: input.dsn,
    sendDefaultPii: false,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    enableLogs: false,
    release: input.release,
    dist: input.dist,
    integrations: input.integrations,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
