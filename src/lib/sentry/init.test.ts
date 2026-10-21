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

  it('starts with privacy defaults after the SDK loads', async () => {
    const { initSentry, isSentryEnabled, setSentryUser, captureAppError } = await loadInit();
    const early = Object.assign(new Error('early'), { requestId: 'req_early' });

    const starting = initSentry({
      dsn: 'https://public@example.ingest.sentry.io/1',
      release: 'abc123',
      environment: 'production',
    });
    setSentryUser('user_1');
    captureAppError(early);
    await starting;

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
    expect(options.tracesSampleRate).toBeUndefined();
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
    expect(installed?.map((integration) => integration.name)).toEqual(['GlobalHandlers', 'Breadcrumbs']);

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user_1' });
    expect(Sentry.captureException).toHaveBeenCalledWith(early);
    setSentryUser(null);
    expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  });

});
