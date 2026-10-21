import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { redactShareTokens, scrubSentryBreadcrumb, scrubSentryEvent } from '@/lib/sentry/scrub';

const TOKEN = 'sekret-token';

function event(): ErrorEvent {
  return {
    type: undefined,
    user: {
      id: 'user_1',
      email: 'ada@example.com',
      username: 'Ada Lovelace',
      ip_address: '203.0.113.8',
      organisationName: 'Acme Books',
    },
    request: {
      url: `https://easybiz.iamjeevan.com/shared/invoice/${TOKEN}?token=${TOKEN}`,
      method: 'POST',
      data: { password: 'hunter2', note: 'private' },
      cookies: { session: 'session-secret' },
      headers: {
        Authorization: 'Bearer session-secret',
        Cookie: 'session=session-secret',
        'Content-Type': 'application/json',
      },
      query_string: { token: TOKEN, page: '1' },
    },
    transaction: `/shared/invoice/${TOKEN}`,
    message: `Failed /shared/invoice/${TOKEN}`,
    exception: {
      values: [{ type: 'Error', value: `Boom /shared/invoice/${TOKEN}` }],
    },
    extra: { organisationName: 'Acme Books', email: 'ada@example.com' },
    breadcrumbs: [
      {
        category: 'ui.input',
        message: 'input value hunter2',
        data: { value: 'hunter2', name: 'password' },
      },
      {
        category: 'fetch',
        data: {
          url: `https://easybiz.iamjeevan.com/shared/invoice/${TOKEN}`,
          method: 'POST',
          status_code: 500,
          request_body: '{"password":"hunter2"}',
          request_headers: { Authorization: 'Bearer session-secret' },
        },
      },
    ],
    contexts: {
      replay: { session_id: 'replay-secret' },
      app: { name: 'EasyBizInvoice' },
    },
  };
}

describe('redactShareTokens', () => {
  it('redacts public invoice share tokens and leaves the route in place', () => {
    expect(redactShareTokens(`https://easybiz.iamjeevan.com/shared/invoice/${TOKEN}`)).toBe(
      'https://easybiz.iamjeevan.com/shared/invoice/[redacted]',
    );
    expect(redactShareTokens(`easybizinvoice://shared/invoice/${TOKEN}?shareToken=${TOKEN}`)).toBe(
      'easybizinvoice://shared/invoice/[redacted]?shareToken=[redacted]',
    );
  });
});

describe('scrubSentryEvent', () => {
  it('removes bodies, cookies, auth headers, form input, email, and organisation name', () => {
    const scrubbed = scrubSentryEvent(event(), {
      originalException: Object.assign(new Error('api failed'), { requestId: 'req_123' }),
    });

    expect(scrubbed).not.toBeNull();
    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('session-secret');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('ada@example.com');
    expect(serialized).not.toContain('Ada Lovelace');
    expect(serialized).not.toContain('Acme Books');
    expect(serialized).not.toContain('203.0.113.8');
    expect(serialized).not.toContain('replay-secret');
    expect(scrubbed?.user).toEqual({ id: 'user_1' });
    expect(scrubbed?.request?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(scrubbed?.request?.data).toBeUndefined();
    expect(scrubbed?.request?.cookies).toBeUndefined();
    expect(scrubbed?.request?.url).toBe(
      'https://easybiz.iamjeevan.com/shared/invoice/[redacted]?token=[redacted]',
    );
    expect(scrubbed?.request?.query_string).toEqual({ token: '[redacted]', page: '1' });
    expect(scrubbed?.breadcrumbs?.[0]).toMatchObject({ category: 'ui.input', message: 'form input' });
    expect(scrubbed?.breadcrumbs?.[0]?.data).toBeUndefined();
    expect(scrubbed?.breadcrumbs?.[1]?.data).toMatchObject({
      method: 'POST',
      status_code: 500,
      url: 'https://easybiz.iamjeevan.com/shared/invoice/[redacted]',
    });
    expect(scrubbed?.tags).toMatchObject({ requestId: 'req_123' });
    expect(scrubbed?.contexts?.replay).toBeUndefined();
    expect(scrubbed?.contexts?.app).toEqual({ name: 'EasyBizInvoice' });
  });

  it('drops replay events', () => {
    const replay = event();
    (replay as { type?: string }).type = 'replay_event';
    expect(scrubSentryEvent(replay)).toBeNull();
  });

  it('ignores request ids that are not safe tokens', () => {
    const scrubbed = scrubSentryEvent(event(), {
      originalException: { requestId: 'not a request id' },
    });
    expect(scrubbed?.tags?.requestId).toBeUndefined();
  });
});

describe('scrubSentryBreadcrumb', () => {
  it('strips form input values before they are recorded', () => {
    const breadcrumb = scrubSentryBreadcrumb({
      category: 'ui.input',
      message: 'password=hunter2',
      data: { value: 'hunter2' },
    });
    expect(breadcrumb).toMatchObject({ message: 'form input' });
    expect(breadcrumb?.data).toBeUndefined();
    expect(JSON.stringify(breadcrumb)).not.toContain('hunter2');
  });
});
