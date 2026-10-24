import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/react';
import { requestIdOf } from '@/lib/sentry/requestId';

const SHARE_PATH = /\/(?:shared\/invoice|shared\/quote|api\/public\/quotes|api\/public\/invoices)\/[^/?#\s"'<>\\]+/gi;
const TOKEN_QUERY = /([?&](?:token|shareToken|share_token)=)[^&#\s"'<>]+/gi;
const SENSITIVE_KEY =
  /^(authorization|proxy-authorization|cookie|cookies|set-cookie|x-api-key|x-auth-token|password|passwd|secret|access_token|refresh_token|id_token|credit_card|card_number|cvv|email|e-mail|username|ip_address|organisation|organization|organisationname|organizationname|orgname)$/i;
const BODY_KEY = /(^|_)(request_)?body$/i;
const HTTP_BODY_KEY = /body|cookie|authorization|header|password|token/i;
const TOKEN_QUERY_KEYS = new Set(['token', 'shareToken', 'share_token']);
const FORM_INPUT_CATEGORIES = new Set(['ui.input', 'ui.change']);

export function redactShareTokens(value: string): string {
  return value.replace(SHARE_PATH, (match) => {
    const path = match.toLowerCase();
    if (path.includes('/api/public/quotes/')) return '/api/public/quotes/[redacted]';
    if (path.includes('/api/public/invoices/')) return '/api/public/invoices/[redacted]';
    if (path.includes('/shared/quote/')) return '/shared/quote/[redacted]';
    return '/shared/invoice/[redacted]';
  }).replace(TOKEN_QUERY, '$1[redacted]');
}

function scrubStringRecord(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactShareTokens(value);
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = scrubStringRecord(value[index], seen);
    }
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SENSITIVE_KEY.test(key) || BODY_KEY.test(key)) {
      delete record[key];
      continue;
    }
    record[key] = scrubStringRecord(record[key], seen);
  }
  return value;
}

function scrubQuery(
  query: NonNullable<ErrorEvent['request']>['query_string'],
): NonNullable<ErrorEvent['request']>['query_string'] {
  if (typeof query === 'string') return redactShareTokens(query);
  if (Array.isArray(query)) {
    return query.map(([key, value]): [string, string] =>
      TOKEN_QUERY_KEYS.has(key) ? [key, '[redacted]'] : [key, redactShareTokens(String(value))],
    );
  }
  if (!query || typeof query !== 'object') return query;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    next[key] = TOKEN_QUERY_KEYS.has(key) ? '[redacted]' : redactShareTokens(String(value));
  }
  return next;
}

function scrubRequest(event: ErrorEvent): void {
  const request = event.request;
  if (!request) return;
  delete request.data;
  delete request.cookies;
  if (request.url) request.url = redactShareTokens(request.url);
  if (request.query_string) request.query_string = scrubQuery(request.query_string);
  if (request.headers) {
    for (const key of Object.keys(request.headers)) {
      if (SENSITIVE_KEY.test(key)) delete request.headers[key];
    }
  }
}

function scrubUser(event: ErrorEvent): void {
  const id = event.user?.id;
  if (typeof id === 'string' || typeof id === 'number') {
    event.user = { id };
    return;
  }
  delete event.user;
}

function isHttpBreadcrumb(breadcrumb: Breadcrumb): boolean {
  return breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr' || breadcrumb.type === 'http';
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category && FORM_INPUT_CATEGORIES.has(breadcrumb.category)) {
    return {
      ...breadcrumb,
      message: 'form input',
      data: undefined,
    };
  }

  if (isHttpBreadcrumb(breadcrumb) && breadcrumb.data) {
    for (const key of Object.keys(breadcrumb.data)) {
      if (HTTP_BODY_KEY.test(key) && key !== 'requestId' && key !== 'status_code') {
        delete breadcrumb.data[key];
      }
    }
  }

  if (typeof breadcrumb.message === 'string' && /bearer\s+\S+|password\s*[:=]/i.test(breadcrumb.message)) {
    breadcrumb.message = '[redacted]';
  }

  scrubStringRecord(breadcrumb, new WeakSet());
  return breadcrumb;
}

export function scrubSentryEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent | null {
  if ((event as { type?: string }).type === 'replay_event') return null;
  scrubUser(event);
  scrubRequest(event);
  if (event.transaction) event.transaction = redactShareTokens(event.transaction);
  if (event.message) event.message = redactShareTokens(event.message);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((breadcrumb) => scrubSentryBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);
  }
  if (event.contexts && 'replay' in event.contexts) {
    delete event.contexts.replay;
  }
  scrubStringRecord(event, new WeakSet());
  const requestId = requestIdOf(hint?.originalException);
  if (requestId) {
    event.tags = { ...event.tags, requestId };
  }
  return event;
}
