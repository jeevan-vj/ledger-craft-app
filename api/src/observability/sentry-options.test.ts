import { describe, expect, it } from 'vitest';
import { isSentryDebugRouteEnabled, sentrySdkOptions } from './sentry-options';

const dsn = 'https://publickey@o123.ingest.sentry.io/456';
const orgId = '11111111-1111-4111-8111-111111111111';
const shareToken = '22222222-2222-4222-8222-222222222222';

describe('sentrySdkOptions', () => {
  it('is a no-op when the DSN is missing or invalid', () => {
    expect(sentrySdkOptions({}).enabled).toBe(false);
    expect(sentrySdkOptions({}).dsn).toBeUndefined();
    expect(sentrySdkOptions({ SENTRY_DSN: '   ' }).enabled).toBe(false);
    expect(sentrySdkOptions({ SENTRY_DSN: 'not-a-dsn' }).enabled).toBe(false);
    expect(sentrySdkOptions({ SENTRY_DSN: 'not-a-dsn' }).dsn).toBe('');
  });

  it('keeps PII off, samples traces at 0.1, and uses the git SHA as the release', () => {
    const options = sentrySdkOptions({
      SENTRY_DSN: dsn,
      NODE_ENV: 'production',
      SENTRY_RELEASE: 'abc123def',
      CF_VERSION_METADATA: { id: 'worker-version-id', tag: 'ignored-when-release-is-set' },
    });
    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe(dsn);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.dataCollection.userInfo).toBe(false);
    expect(options.dataCollection.cookies).toBe(false);
    expect(options.dataCollection.httpBodies).toEqual([]);
    expect(options.dataCollection.urlQueryParams).toBe(false);
    expect(options.dataCollection.stackFrameVariables).toBe(false);
    expect(options.tracesSampleRate).toBe(0.1);
    expect(options.environment).toBe('production');
    expect(options.release).toBe('abc123def');
    expect(options.rpcTracePropagationBindings).toEqual(['IDENTITY', 'LEDGERS']);
  });

  it('reads a configured sample rate and falls back when the value is unusable', () => {
    expect(sentrySdkOptions({ SENTRY_TRACES_SAMPLE_RATE: '0' }).tracesSampleRate).toBe(0);
    expect(sentrySdkOptions({ SENTRY_TRACES_SAMPLE_RATE: '0.25' }).tracesSampleRate).toBe(0.25);
    expect(sentrySdkOptions({ SENTRY_TRACES_SAMPLE_RATE: '1' }).tracesSampleRate).toBe(1);
    expect(sentrySdkOptions({ SENTRY_TRACES_SAMPLE_RATE: 'nope' }).tracesSampleRate).toBe(0.1);
    expect(sentrySdkOptions({ SENTRY_TRACES_SAMPLE_RATE: '2' }).tracesSampleRate).toBe(0.1);
    expect(sentrySdkOptions({ SENTRY_TRACES_SAMPLE_RATE: '-0.2' }).tracesSampleRate).toBe(0.1);
  });

  it('uses the version tag only when it is the git SHA carried as the deploy tag', () => {
    const options = sentrySdkOptions({
      SENTRY_DSN: dsn,
      CF_VERSION_METADATA: { id: 'not-the-git-sha', tag: 'deadbeef' },
      SENTRY_ENVIRONMENT: 'staging',
      NODE_ENV: 'production',
    });
    expect(options.release).toBe('deadbeef');
    expect(options.release).not.toBe('not-the-git-sha');
    expect(options.environment).toBe('staging');
    expect(sentrySdkOptions({ CF_VERSION_METADATA: { id: 'only-the-version-id' } }).release).toBeUndefined();
  });

  it('runs the beforeSend scrubber', () => {
    const options = sentrySdkOptions({ SENTRY_DSN: dsn });
    const event = options.beforeSend({
      request: {
        url: `https://easybiz.example/api/public/invoices/${orgId}_${shareToken}?token=secret`,
        headers: { Authorization: 'Bearer secret', 'x-request-id': 'req_1' },
        data: { password: 'hunter2' },
      },
      user: { id: 'user_1', email: 'person@example.com' },
    });
    expect(event.request?.url).toBe('https://easybiz.example/api/public/invoices/:token');
    expect(event.request?.headers).toEqual({ 'x-request-id': 'req_1' });
    expect(event.request?.data).toBeUndefined();
    expect(event.user).toEqual({ id: 'user_1' });
  });
});

describe('isSentryDebugRouteEnabled', () => {
  it('stays off in production even when the debug flag is set', () => {
    expect(isSentryDebugRouteEnabled({ NODE_ENV: 'production', SENTRY_DEBUG_ROUTE: 'true' })).toBe(false);
    expect(isSentryDebugRouteEnabled({ NODE_ENV: 'development', SENTRY_DEBUG_ROUTE: 'true' })).toBe(true);
    expect(isSentryDebugRouteEnabled({ NODE_ENV: 'development', SENTRY_DEBUG_ROUTE: 'false' })).toBe(false);
    expect(isSentryDebugRouteEnabled({})).toBe(false);
  });
});
