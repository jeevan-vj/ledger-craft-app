import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(() => 'event-id'),
  withScope: vi.fn((callback: (scope: { setTag: () => void; setContext: () => void }) => unknown) =>
    callback({ setTag: vi.fn(), setContext: vi.fn() }),
  ),
  addBreadcrumb: vi.fn(),
  reactRouterBrowserTracingIntegration: vi.fn(() => ({ name: 'ReactRouterBrowserTracing' })),
  wrapCreateBrowserRouter: vi.fn((createRouter: unknown) => createRouter),
}));

import * as Sentry from '@sentry/react';

async function loadInit() {
  vi.resetModules();
  return import('@/lib/sentry/init');
}

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when the DSN is unset', async () => {
    const { initSentry, isSentryEnabled, setSentryUser, captureAppError } = await loadInit();

    initSentry();
    setSentryUser('user_1');
    captureAppError(new Error('local'));

    expect(isSentryEnabled()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.setUser).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('starts with privacy defaults and a low sample rate', async () => {
    const { initSentry, isSentryEnabled, setSentryUser } = await loadInit();

    initSentry({
      dsn: 'https://public@example.ingest.sentry.io/1',
      release: 'abc123',
      environment: 'production',
    });

    expect(isSentryEnabled()).toBe(true);
    expect(Sentry.init).toHaveBeenCalledOnce();
    const options = vi.mocked(Sentry.init).mock.calls[0][0];
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      stackFrameVariables: false,
    });
    expect(options.tracesSampleRate).toBe(0.1);
    expect(options.release).toBe('abc123');
    expect(options.environment).toBe('production');
    const scrubbed = options.beforeSend?.(
      {
        type: undefined,
        request: {
          url: 'https://easybiz.iamjeevan.com/shared/invoice/sekret-token',
          data: { password: 'hunter2' },
        },
      },
      {},
    );
    expect(JSON.stringify(scrubbed)).not.toContain('sekret-token');
    expect(JSON.stringify(scrubbed)).not.toContain('hunter2');
    const breadcrumb = options.beforeBreadcrumb?.({
      category: 'ui.input',
      message: 'password=hunter2',
      data: { value: 'hunter2' },
    });
    expect(breadcrumb?.message).toBe('form input');
    expect(breadcrumb?.data).toBeUndefined();
    expect(JSON.stringify(options)).not.toContain('replay');

    const defaults = [{ name: 'GlobalHandlers' }, { name: 'Replay' }, { name: 'Breadcrumbs' }];
    const installed =
      typeof options.integrations === 'function' ? options.integrations(defaults) : options.integrations;
    expect(installed?.map((integration) => integration.name)).toEqual([
      'GlobalHandlers',
      'Breadcrumbs',
      'ReactRouterBrowserTracing',
    ]);

    setSentryUser('user_1');
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user_1' });
    setSentryUser(null);
    expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  });

  it('uses a configured traces sample rate and ignores values outside 0 to 1', async () => {
    const { initSentry, readTracesSampleRate } = await loadInit();
    expect(readTracesSampleRate('0.25')).toBe(0.25);
    expect(readTracesSampleRate('0')).toBe(0);
    expect(readTracesSampleRate('')).toBe(0.1);
    expect(readTracesSampleRate('2')).toBe(0.1);
    expect(readTracesSampleRate('nope')).toBe(0.1);

    initSentry({
      dsn: 'https://public@example.ingest.sentry.io/1',
      tracesSampleRate: '0.25',
    });
    expect(vi.mocked(Sentry.init).mock.calls[0][0].tracesSampleRate).toBe(0.25);
  });
});
