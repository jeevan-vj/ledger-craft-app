import { isConsoleErrorDump, redactSecrets, scrubBreadcrumb, scrubSentryEvent } from './scrub';

describe('sentry scrubber', () => {
  it('redacts invoice share tokens in public links and API paths', () => {
    const web = redactSecrets('https://easybiz.iamjeevan.com/shared/invoice/org_secret-token');
    const api = redactSecrets(
      'https://easybiz.iamjeevan.com/api/public/invoices/11111111-1111-1111-1111-111111111111_22222222-2222-2222-2222-222222222222',
    );
    const app = redactSecrets('easybizinvoice://shared/invoice/another-token?shareToken=query-secret');

    expect(web).toBe('https://easybiz.iamjeevan.com/shared/invoice/[redacted]');
    expect(api).toBe('https://easybiz.iamjeevan.com/api/public/invoices/[redacted]');
    expect(app).toBe('easybizinvoice://shared/invoice/[redacted]?shareToken=[redacted]');
    expect(web).not.toContain('org_secret-token');
    expect(api).not.toContain('22222222');
  });

  it('redacts quote share tokens in public links, API paths, and deep links', () => {
    const web = redactSecrets('https://easybiz.iamjeevan.com/shared/quote/org_quote-token');
    const api = redactSecrets(
      'https://easybiz.iamjeevan.com/api/public/quotes/11111111-1111-1111-1111-111111111111_33333333-3333-3333-3333-333333333333/respond',
    );
    const app = redactSecrets('easybizinvoice://shared/quote/quote-token?shareToken=query-secret');

    expect(web).toBe('https://easybiz.iamjeevan.com/shared/quote/[redacted]');
    expect(api).toBe('https://easybiz.iamjeevan.com/api/public/quotes/[redacted]/respond');
    expect(app).toBe('easybizinvoice://shared/quote/[redacted]?shareToken=[redacted]');
    expect(web).not.toContain('org_quote-token');
    expect(api).not.toContain('33333333');
    expect(app).not.toContain('quote-token');
  });

  it('redacts public Stripe payment tokens in page and API paths', () => {
    const web = redactSecrets('https://easybiz.iamjeevan.com/pay/payment-secret');
    const api = redactSecrets('https://easybiz.iamjeevan.com/api/public/pay/payment-secret');

    expect(web).toBe('https://easybiz.iamjeevan.com/pay/[redacted]');
    expect(api).toBe('https://easybiz.iamjeevan.com/api/public/pay/[redacted]');
    expect(`${web}${api}`).not.toContain('payment-secret');
  });

  it('strips request bodies, cookies, and auth headers, and keeps only the user id', () => {
    const event = scrubSentryEvent({
      user: { id: 'user_1', email: 'owner@example.com', username: 'owner', ip_address: '203.0.113.8' },
      request: {
        url: 'https://easybiz.iamjeevan.com/shared/invoice/share-token',
        method: 'POST',
        data: { password: 'hunter2', note: 'whole body' },
        cookies: { session: 'cookie-value' },
        headers: {
          Authorization: 'Bearer abc.def',
          Cookie: 'session=cookie-value',
          'set-auth-token': 'session-token',
          'X-Api-Key': 'key-1',
          Accept: 'application/json',
        },
      },
      extra: { email: 'should-drop@example.com' },
    });

    expect(event?.user).toEqual({ id: 'user_1' });
    expect(event?.request).toMatchObject({
      method: 'POST',
      url: 'https://easybiz.iamjeevan.com/shared/invoice/[redacted]',
      headers: { Accept: 'application/json' },
    });
    expect(event?.request).not.toHaveProperty('data');
    expect(event?.request).not.toHaveProperty('cookies');
    expect(JSON.stringify(event)).not.toContain('hunter2');
    expect(JSON.stringify(event)).not.toContain('cookie-value');
    expect(JSON.stringify(event)).not.toContain('session-token');
    expect(JSON.stringify(event)).not.toContain('Bearer abc.def');
    expect(JSON.stringify(event)).not.toContain('owner@example.com');
    expect(JSON.stringify(event)).not.toContain('should-drop@example.com');
    expect(JSON.stringify(event)).not.toContain('203.0.113.8');
  });

  it('drops console breadcrumbs that carry error objects or server messages', () => {
    const dumped = scrubBreadcrumb({
      category: 'console',
      level: 'error',
      message: 'Error: Invoice failed: customer secret',
      data: { arguments: [new Error('Invoice failed: customer secret')], logger: 'console' },
    });
    const objectArg = scrubBreadcrumb({
      category: 'console',
      level: 'log',
      message: 'failed',
      data: { arguments: ['failed', { message: 'server said too much' }] },
    });

    expect(dumped).toBeNull();
    expect(objectArg).toBeNull();
    expect(isConsoleErrorDump({ category: 'console', level: 'fatal' })).toBe(true);
  });

  it('keeps ordinary console notes after redacting share links', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'console',
      level: 'info',
      message: 'Opened https://easybiz.iamjeevan.com/shared/invoice/tok_123',
      data: { logger: 'console', arguments: ['Opened https://easybiz.iamjeevan.com/shared/invoice/tok_123'] },
    });

    expect(breadcrumb?.message).toBe('Opened https://easybiz.iamjeevan.com/shared/invoice/[redacted]');
    expect(JSON.stringify(breadcrumb)).not.toContain('tok_123');
  });

  it('redacts share tokens on fetch breadcrumbs and drops replay events', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'xhr',
      level: 'info',
      data: {
        method: 'GET',
        url: 'https://easybiz.iamjeevan.com/api/public/invoices/tok_999',
        status_code: 500,
        request_body: { card: '4111' },
        headers: { cookie: 'sid=1', accept: 'application/json' },
      },
    });

    expect(breadcrumb?.data).toMatchObject({
      method: 'GET',
      url: 'https://easybiz.iamjeevan.com/api/public/invoices/[redacted]',
      status_code: 500,
      headers: { accept: 'application/json' },
    });
    expect(JSON.stringify(breadcrumb)).not.toContain('4111');
    expect(JSON.stringify(breadcrumb)).not.toContain('sid=1');
    expect(scrubSentryEvent({ type: 'replay_event', user: { id: 'user_1' } })).toBeNull();
  });

  it('redacts share tokens inside serialized exception values from public reads', () => {
    const event = scrubSentryEvent({
      exception: {
        values: [{
          type: 'Error',
          value: 'GET https://easybiz.iamjeevan.com/api/public/invoices/org_secret-token failed',
        }],
      },
      extra: {
        shareToken: 'org_secret-token',
        note: 'opened easybizinvoice://shared/quote/quote-token',
      },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('org_secret-token');
    expect(serialized).not.toContain('quote-token');
    expect(serialized).toContain('/api/public/invoices/[redacted]');
    expect(serialized).toContain('shared/quote/[redacted]');
  });

  it('drops a user object that has no id', () => {
    const event = scrubSentryEvent({ user: { email: 'only-email@example.com', ip_address: '127.0.0.1' } });
    expect(event).not.toHaveProperty('user');
  });
});
