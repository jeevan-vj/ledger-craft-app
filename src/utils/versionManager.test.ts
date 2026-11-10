import { afterEach, expect, it, vi } from 'vitest';
import { fetchDeployedVersion, forceRefresh, isVersionOutdated } from './versionManager';

const env = import.meta.env;
const previousEnv = { DEV: env.DEV, VITE_BUILD_HASH: env.VITE_BUILD_HASH, VITE_BUILD_TIME: env.VITE_BUILD_TIME };

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  Object.assign(env, previousEnv);
  vi.restoreAllMocks();
});

it('keeps uncertain financial requests when an app update clears ordinary caches', async () => {
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  const protectedKeys = ['ledgercraft:pending-invoice-payment:v1:company:invoice',
    'ledgercraft:pending-bill-payment:company:user:bill', 'ledgercraft:pending-credit:company:user:invoice:issue',
    'ledgercraft.pending.v1.owner.manual-journal'];
  protectedKeys.forEach(key => localStorage.setItem(key, 'original-body-and-key'));
  sessionStorage.setItem(protectedKeys[0], 'session-request');
  localStorage.setItem('old-ui-cache', 'stale');
  sessionStorage.setItem('old-ui-cache', 'stale');
  await forceRefresh();
  protectedKeys.forEach(key => expect(localStorage.getItem(key)).toBe('original-body-and-key'));
  expect(sessionStorage.getItem(protectedKeys[0])).toBe('session-request');
  expect(localStorage.getItem('old-ui-cache')).toBeNull();
  expect(sessionStorage.getItem('old-ui-cache')).toBeNull();
  expect(reload).toHaveBeenCalledOnce();
});

it('notices a newer deploy on the first version.json read', async () => {
  Object.assign(env, { DEV: false, VITE_BUILD_HASH: 'embedded-hash', VITE_BUILD_TIME: '1000' });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ version: '0.0.8', hash: 'deployed-hash', buildTime: 2000 }),
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(isVersionOutdated()).resolves.toBe(true);
  await expect(isVersionOutdated()).resolves.toBe(true);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/^\/version\.json\?t=\d+$/),
    expect.objectContaining({ cache: 'no-store' }),
  );
  await expect(fetchDeployedVersion()).resolves.toMatchObject({ hash: 'deployed-hash', buildTime: 2000 });
});
