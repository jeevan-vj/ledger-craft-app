import { afterEach, expect, it, vi } from 'vitest';
import { forceRefresh } from './versionManager';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

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
