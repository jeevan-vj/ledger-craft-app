const ID_36 = '[0-9a-f-]{36}';
const SHARE_PAIR = new RegExp(`(${ID_36})_(${ID_36})`, 'gi');
const SHARE_PATH = new RegExp(`/api/public/(invoices|quotes)/${ID_36}_${ID_36}`, 'gi');

const SENSITIVE_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'cookies',
  'set-cookie',
  'set-auth-token',
  'x-auth-token',
  'x-api-key',
  'password',
  'passwd',
  'secret',
  'api-key',
  'apikey',
  'token',
  'access-token',
  'refresh-token',
  'id-token',
  'session',
  'session-token',
  'email',
  'username',
  'ip-address',
  'ip',
  'geo',
  'organisation-name',
  'organization-name',
  'org-name',
  'body',
  'request-body',
  'query-string',
  'querystring',
  'vars',
]);

export type ScrubbableEvent = {
  message?: string;
  transaction?: string;
  release?: string;
  environment?: string;
  request?: {
    url?: string;
    method?: string;
    data?: unknown;
    query_string?: unknown;
    cookies?: unknown;
    headers?: Record<string, unknown>;
    env?: unknown;
  };
  user?: Record<string, unknown> | null;
  breadcrumbs?: ScrubbableBreadcrumb[];
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: { frames?: Array<Record<string, unknown>> };
    }>;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  spans?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type ScrubbableBreadcrumb = {
  message?: string;
  category?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[_\s]/g, '-');
  if (normalized === 'request-id' || normalized === 'x-request-id') return false;
  if (SENSITIVE_KEYS.has(normalized)) return true;
  return (
    normalized.endsWith('-token') ||
    normalized.endsWith('-secret') ||
    /(authorization|cookie|password|secret|api-key|set-auth-token)/.test(normalized)
  );
}

/** Removes query strings, share tokens, credentials, and email addresses from free text. */
export function scrubText(value: string): string {
  let text = value.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => scrubUrl(url));
  text = text.replace(SHARE_PAIR, '$1_[redacted]');
  text = text.replace(/[?#][^\s"'<>]*/g, '');
  text = text.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
  text = text.replace(
    /\b(password|passwd|secret|token|api[_-]?key|authorization|cookie|set-auth-token)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}&]+)/gi,
    '$1=[redacted]',
  );
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
  return text;
}

/** Route template for a path or absolute URL. Share tokens and other ids are parameters. */
export function toRouteTemplate(value: string): string {
  let path = value;
  try {
    if (value.includes('://')) path = new URL(value).pathname;
  } catch {
    path = value;
  }
  path = path.split(/[?#]/, 1)[0] ?? path;
  path = path.replace(SHARE_PATH, '/api/public/$1/:token');
  const segments = path.split('/').map((segment) => {
    if (segment.startsWith(':')) return segment;
    if (/^[0-9a-f-]{36}$/i.test(segment)) return ':id';
    if (segment.length >= 24 && /^[A-Za-z0-9_-]+$/.test(segment)) return ':token';
    return segment;
  });
  return segments.join('/') || '/';
}

export function scrubTransactionName(value: string): string {
  const match = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)$/i.exec(value.trim());
  if (!match?.[1] || !match[2]) return toRouteTemplate(scrubText(value));
  return `${match[1].toUpperCase()} ${toRouteTemplate(match[2])}`;
}

export function scrubUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    url.pathname = toRouteTemplate(url.pathname);
    return url.toString();
  } catch {
    return toRouteTemplate(value.split(/[?#]/, 1)[0] ?? value);
  }
}

export function routeTemplateFrom(routePath: string | undefined, path: string): string {
  const candidate = routePath && routePath !== '*' && routePath !== '/*' ? routePath : path;
  return toRouteTemplate(candidate);
}

function scrubUnknown(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) value[index] = scrubUnknown(value[index], seen);
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (isSensitiveKey(key)) {
      delete record[key];
      continue;
    }
    const current = record[key];
    if (typeof current === 'string' && (key === 'url' || key === 'url.full' || key.endsWith('url'))) {
      record[key] = scrubUrl(current);
      continue;
    }
    if (key === 'transaction' && typeof current === 'string') {
      record[key] = scrubTransactionName(current);
      continue;
    }
    record[key] = scrubUnknown(current, seen);
  }
  return record;
}

function scrubUser(user: Record<string, unknown> | null | undefined): { id: string } | undefined {
  const id = user?.id;
  if (typeof id !== 'string' && typeof id !== 'number') return undefined;
  const text = String(id);
  if (text.includes('@') || new RegExp(SHARE_PAIR.source, 'i').test(text)) return undefined;
  return { id: text };
}

/** beforeSend scrubber. Drops bodies, cookies, query strings, and auth headers, then redacts the rest. */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    delete event.request.env;
    if (typeof event.request.url === 'string') event.request.url = scrubUrl(event.request.url);
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (isSensitiveKey(key)) delete event.request.headers[key];
      }
    }
  }
  const user = scrubUser(event.user);
  if (user) event.user = user;
  else delete event.user;
  if (typeof event.transaction === 'string') event.transaction = scrubTransactionName(event.transaction);
  if (typeof event.message === 'string') event.message = scrubText(event.message);
  if (event.tags && typeof event.tags.route === 'string') {
    event.tags.route = toRouteTemplate(event.tags.route);
  }
  scrubUnknown(event, new WeakSet());
  return event;
}

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T {
  scrubUnknown(breadcrumb, new WeakSet());
  if (typeof breadcrumb.message === 'string') breadcrumb.message = scrubText(breadcrumb.message);
  return breadcrumb;
}
