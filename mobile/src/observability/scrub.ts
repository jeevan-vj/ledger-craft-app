const REDACTED = '[redacted]';
const MAX_DEPTH = 8;

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'cookies',
  'setcookie',
  'setauthtoken',
  'xapikey',
  'proxyauthorization',
  'xauthtoken',
  'password',
  'passwd',
  'secret',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authtoken',
  'sessiontoken',
  'requestbody',
  'responsebody',
  'ipaddress',
  'email',
  'username',
]);

export interface ScrubbableBreadcrumb {
  category?: string;
  level?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ScrubbableEvent {
  type?: string;
  user?: Record<string, unknown> | null;
  request?: Record<string, unknown>;
  breadcrumbs?: ScrubbableBreadcrumb[];
  [key: string]: unknown;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

function isShareQueryKey(key: string): boolean {
  return normalizeKey(key) === 'sharetoken';
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(\/(?:shared\/(?:invoice|quote)|pay|api\/public\/(?:invoices|quotes|pay))\/)([^/?#\s"'<>]+)/gi, `$1${REDACTED}`)
    .replace(/([?&](?:shareToken|share_token)=)([^&#\s"'<>]+)/gi, `$1${REDACTED}`)
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]');
}

export function isConsoleErrorDump(breadcrumb: {
  category?: string;
  level?: string;
  data?: { arguments?: unknown[] };
}): boolean {
  if (breadcrumb.category !== 'console') return false;
  if (breadcrumb.level === 'error' || breadcrumb.level === 'fatal') return true;
  const args = breadcrumb.data?.arguments;
  return Array.isArray(args) && args.some((entry) => entry !== null && typeof entry === 'object');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function scrubHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveKey(key)) continue;
    next[key] = typeof value === 'string' ? redactSecrets(value) : scrubUnknown(value, 1);
  }
  return next;
}

function scrubQuery(query: unknown, depth: number): unknown {
  if (typeof query === 'string') return redactSecrets(query);
  if (Array.isArray(query)) {
    return query.map((entry) => {
      if (Array.isArray(entry) && typeof entry[0] === 'string') {
        const key = entry[0];
        if (isShareQueryKey(key)) return [key, REDACTED];
        return [key, typeof entry[1] === 'string' ? redactSecrets(entry[1]) : scrubUnknown(entry[1], depth + 1)];
      }
      return scrubUnknown(entry, depth + 1);
    });
  }
  if (!isPlainObject(query)) return scrubUnknown(query, depth);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    next[key] = isShareQueryKey(key) || isSensitiveKey(key)
      ? REDACTED
      : typeof value === 'string'
        ? redactSecrets(value)
        : scrubUnknown(value, depth + 1);
  }
  return next;
}

function scrubRequestLike(record: Record<string, unknown>, depth: number): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const normalized = normalizeKey(key);
    if (normalized === 'data' || normalized === 'body' || normalized === 'cookies' || normalized === 'cookie' || isSensitiveKey(key)) {
      continue;
    }
    if (normalized === 'headers' && isPlainObject(value)) {
      next[key] = scrubHeaders(value);
      continue;
    }
    if (normalized === 'querystring') {
      next[key] = scrubQuery(value, depth + 1);
      continue;
    }
    if (normalized === 'url' && typeof value === 'string') {
      next[key] = redactSecrets(value);
      continue;
    }
    next[key] = scrubUnknown(value, depth + 1, key);
  }
  return next;
}

function looksLikeRequest(record: Record<string, unknown>): boolean {
  const keys = new Set(Object.keys(record).map(normalizeKey));
  return keys.has('headers') || keys.has('cookies') || (keys.has('url') && (keys.has('method') || keys.has('httpmethod')));
}

function scrubUnknown(value: unknown, depth: number, key?: string): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return typeof value === 'string' ? redactSecrets(value) : REDACTED;
  if (typeof value === 'string') return redactSecrets(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactSecrets(value.message) };
  }
  if (Array.isArray(value)) return value.map((entry) => scrubUnknown(entry, depth + 1));
  if (!isPlainObject(value)) return undefined;

  if (key === 'user') {
    const id = value.id;
    if (typeof id === 'string' && id.trim()) return { id };
    if (typeof id === 'number') return { id: String(id) };
    return undefined;
  }
  if (looksLikeRequest(value)) return scrubRequestLike(value, depth);

  const next: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (isSensitiveKey(childKey)) continue;
    if (childKey === 'user' && isPlainObject(childValue)) {
      const user = scrubUnknown(childValue, depth + 1, 'user');
      if (user) next[childKey] = user;
      continue;
    }
    if (normalizeKey(childKey) === 'headers' && isPlainObject(childValue)) {
      next[childKey] = scrubHeaders(childValue);
      continue;
    }
    if (normalizeKey(childKey) === 'querystring' || isShareQueryKey(childKey)) {
      next[childKey] = isShareQueryKey(childKey) ? REDACTED : scrubQuery(childValue, depth + 1);
      continue;
    }
    const scrubbed = scrubUnknown(childValue, depth + 1, childKey);
    if (scrubbed !== undefined) next[childKey] = scrubbed;
  }
  return next;
}

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T | null {
  if (isConsoleErrorDump(breadcrumb)) return null;
  return scrubUnknown(breadcrumb, 0) as T;
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T | null {
  if (event.type === 'replay_event') return null;
  return scrubUnknown(event, 0) as T;
}
