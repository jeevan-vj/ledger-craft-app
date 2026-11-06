import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerCapabilities, resetServerCapabilitiesForTests } from './capabilitiesService';

describe('getServerCapabilities', () => {
  beforeEach(() => { resetServerCapabilitiesForTests(); vi.restoreAllMocks(); });

  it('fails closed for every optional server capability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getServerCapabilities()).resolves.toEqual({ email: 'unavailable', ai: 'unavailable', stripe: 'unavailable' });
  });
});
