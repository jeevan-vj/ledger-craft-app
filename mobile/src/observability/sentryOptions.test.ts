import {
  apiErrorTags,
  buildSentryInitOptions,
  formatRelease,
  normalizeSentryDsn,
  selectSentryIntegrations,
  shouldReportApiStatus,
  toSentryUser,
  TRACES_SAMPLE_RATE,
} from './sentryOptions';

describe('sentry options', () => {
  it('treats a missing DSN as disabled', () => {
    expect(normalizeSentryDsn(undefined)).toBe('');
    expect(normalizeSentryDsn('   ')).toBe('');
    expect(normalizeSentryDsn(' https://public@o0.ingest.sentry.io/1 ')).toBe('https://public@o0.ingest.sentry.io/1');
  });

  it('builds release and dist from the app version and build number', () => {
    expect(formatRelease({
      applicationId: 'com.easybizinvoice.app',
      version: '1.0.0',
      build: '12',
    })).toEqual({
      release: 'com.easybizinvoice.app@1.0.0+12',
      dist: '12',
    });
    expect(formatRelease({ applicationId: 'com.easybizinvoice.app', version: '1.0.0' })).toEqual({});
  });

  it('keeps the user id and leaves replay and default PII off', () => {
    expect(toSentryUser(' user_9 ')).toEqual({ id: 'user_9' });
    expect(toSentryUser('   ')).toBeNull();
    expect(toSentryUser(null)).toBeNull();

    const options = buildSentryInitOptions({
      dsn: 'https://public@o0.ingest.sentry.io/1',
      release: 'com.easybizinvoice.app@1.0.0+12',
      dist: '12',
      integrations: [],
    });

    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(TRACES_SAMPLE_RATE);
    expect(options.tracesSampleRate).toBeLessThanOrEqual(0.1);
    expect(options.enableCaptureFailedRequests).toBe(false);
    expect(options.attachScreenshot).toBe(false);
    expect(options.enableLogs).toBe(false);
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    expect(options.release).toBe('com.easybizinvoice.app@1.0.0+12');
    expect(options.dist).toBe('12');
  });

  it('replaces console breadcrumbs and leaves Mobile Replay out', () => {
    const selected = selectSentryIntegrations(
      [
        { name: 'Breadcrumbs' },
        { name: 'MobileReplay' },
        { name: 'Dedupe' },
      ],
      [{ name: 'Breadcrumbs', console: false }, { name: 'ReactNavigation' }],
    );

    expect(selected.map((integration) => integration.name)).toEqual(['Dedupe', 'Breadcrumbs', 'ReactNavigation']);
    expect(selected.find((integration) => integration.name === 'Breadcrumbs')).toMatchObject({ console: false });
  });

  it('tags API failures with the server request id', () => {
    expect(shouldReportApiStatus(500)).toBe(true);
    expect(shouldReportApiStatus(0)).toBe(true);
    expect(shouldReportApiStatus(401)).toBe(false);
    expect(shouldReportApiStatus(404)).toBe(false);
    expect(apiErrorTags(503, 'req_42')).toEqual({
      source: 'api',
      'http.status': '503',
      requestId: 'req_42',
    });
    expect(apiErrorTags(500)).not.toHaveProperty('requestId');
  });

  it('runs captured events through the scrubber', () => {
    const options = buildSentryInitOptions({ dsn: 'https://public@o0.ingest.sentry.io/1', integrations: [] });
    const event = options.beforeSend({
      request: {
        url: 'https://easybiz.iamjeevan.com/api/public/invoices/tok_1',
        method: 'GET',
        data: { secret: 'body' },
        headers: { 'set-auth-token': 'abc', accept: 'application/json' },
      },
      user: { id: 'user_1', email: 'a@b.c' },
    });
    expect(event?.request?.url).toBe('https://easybiz.iamjeevan.com/api/public/invoices/[redacted]');
    expect(event?.request).not.toHaveProperty('data');
    expect(event?.user).toEqual({ id: 'user_1' });
    expect(options.beforeBreadcrumb({
      category: 'console',
      level: 'error',
      message: 'Error: server message',
      data: { arguments: [{ message: 'server message' }] },
    })).toBeNull();
  });
});
