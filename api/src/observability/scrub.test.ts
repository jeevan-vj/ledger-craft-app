import { describe, expect, it } from 'vitest';
import {
  scrubSentryEvent,
  scrubText,
  scrubUrl,
  toRouteTemplate,
  type ScrubbableEvent,
} from './scrub';

const orgId = '11111111-1111-4111-8111-111111111111';
const shareToken = '22222222-2222-4222-8222-222222222222';
const sharePath = `/api/public/invoices/${orgId}_${shareToken}`;

describe('route templates', () => {
  it('replaces a public invoice share token with a route parameter', () => {
    expect(toRouteTemplate(sharePath)).toBe('/api/public/invoices/:token');
    expect(toRouteTemplate(`https://easybiz.example${sharePath}?download=1`)).toBe('/api/public/invoices/:token');
    expect(toRouteTemplate(`/api/public/quotes/${orgId}_${shareToken}`)).toBe('/api/public/quotes/:token');
    expect(toRouteTemplate(`/api/public/quotes/${orgId}_${shareToken}/respond`)).toBe('/api/public/quotes/:token/respond');
  });

  it('parameterises id segments and leaves stable auth paths', () => {
    expect(toRouteTemplate(`/api/customers/${orgId}/invoices/${shareToken}`)).toBe(
      '/api/customers/:id/invoices/:id',
    );
    expect(toRouteTemplate('/api/auth/sign-in/email')).toBe('/api/auth/sign-in/email');
    expect(toRouteTemplate('/api/auth/reset-password/abcdefghijklmnopqrstuvwxyz012345')).toBe(
      '/api/auth/reset-password/:token',
    );
  });
});

describe('scrubText', () => {
  it('keeps an ordinary error message and redacts secrets', () => {
    expect(scrubText('database unavailable')).toBe('database unavailable');
    expect(scrubText('password authentication failed for user "postgres"')).toBe(
      'password authentication failed for user "postgres"',
    );
    const scrubbed = scrubText(
      `failed ${sharePath}?access=secret Bearer abc.def.ghi password=hunter2 cookie=session set-auth-token: raw-token user@example.com`,
    );
    expect(scrubbed).not.toContain(shareToken);
    expect(scrubbed).not.toContain('secret');
    expect(scrubbed).not.toContain('abc.def.ghi');
    expect(scrubbed).not.toContain('hunter2');
    expect(scrubbed).not.toContain('session');
    expect(scrubbed).not.toContain('raw-token');
    expect(scrubbed).not.toContain('user@example.com');
    expect(scrubbed).toContain(`${orgId}_[redacted]`);
    expect(scrubbed).toContain('Bearer [redacted]');
    expect(scrubbed).toContain('password=[redacted]');
  });
});

describe('scrubSentryEvent', () => {
  it('drops bodies, cookies, query strings, and auth headers, and keeps only the user id', () => {
    const event: ScrubbableEvent = {
      transaction: `GET ${sharePath}?x=1`,
      message: `boom ${sharePath}`,
      request: {
        url: `https://easybiz.example${sharePath}?token=query-secret#frag`,
        method: 'GET',
        data: { card: '4111', password: 'hunter2' },
        query_string: 'token=query-secret',
        cookies: { session: 'raw-session' },
        env: { BETTER_AUTH_SECRET: 'signing-secret' },
        headers: {
          Authorization: 'Bearer header-token',
          cookie: 'session=raw-session',
          'set-auth-token': 'auth-token-value',
          'X-Api-Key': 'key-value',
          'content-type': 'application/json',
          'x-request-id': 'req_keep',
        },
      },
      user: {
        id: 'user_1',
        email: 'person@example.com',
        username: 'Ada',
        ip_address: '203.0.113.5',
        name: 'Ada Lovelace',
      },
      extra: { organisationName: 'Acme Books', note: 'kept' },
      breadcrumbs: [
        {
          category: 'http',
          message: `GET ${sharePath}?q=hidden`,
          data: { url: `https://easybiz.example${sharePath}?q=hidden`, cookie: 'nope' },
        },
      ],
      exception: {
        values: [
          {
            type: 'Error',
            value: `share ${orgId}_${shareToken} Bearer leak-token`,
            stacktrace: {
              frames: [
                {
                  filename: sharePath,
                  vars: { password: 'hunter2', email: 'person@example.com' },
                },
              ],
            },
          },
        ],
      },
      tags: { route: sharePath, requestId: 'req_keep' },
    };

    const scrubbed = scrubSentryEvent(event);
    const serialised = JSON.stringify(scrubbed);

    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.request?.env).toBeUndefined();
    expect(scrubbed.request?.headers).toEqual({
      'content-type': 'application/json',
      'x-request-id': 'req_keep',
    });
    expect(scrubbed.request?.url).toBe('https://easybiz.example/api/public/invoices/:token');
    expect(scrubbed.transaction).toBe('GET /api/public/invoices/:token');
    expect(scrubbed.user).toEqual({ id: 'user_1' });
    expect(scrubbed.extra).toEqual({ note: 'kept' });
    expect(scrubbed.tags?.route).toBe('/api/public/invoices/:token');
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined();
    expect(serialised).not.toContain(shareToken);
    expect(serialised).not.toContain('query-secret');
    expect(serialised).not.toContain('header-token');
    expect(serialised).not.toContain('auth-token-value');
    expect(serialised).not.toContain('raw-session');
    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('person@example.com');
    expect(serialised).not.toContain('Ada');
    expect(serialised).not.toContain('Acme');
    expect(serialised).not.toContain('signing-secret');
    expect(serialised).not.toContain('leak-token');
    expect(scrubUrl(`https://easybiz.example${sharePath}?download=1`)).not.toContain(shareToken);
  });

  it('drops a user id that is an email address', () => {
    const event: ScrubbableEvent = { user: { id: 'person@example.com', email: 'person@example.com' } };
    expect(scrubSentryEvent(event).user).toBeUndefined();
  });
});
