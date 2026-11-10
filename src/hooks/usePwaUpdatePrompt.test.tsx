import { render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePwaUpdatePrompt } from './usePwaUpdatePrompt';

const env = import.meta.env;
const previousEnv = { DEV: env.DEV, VITE_BUILD_HASH: env.VITE_BUILD_HASH, VITE_BUILD_TIME: env.VITE_BUILD_TIME };

function Probe() {
  usePwaUpdatePrompt();
  return null;
}

afterEach(() => {
  Object.assign(env, previousEnv);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

it('checks version.json and asks the service worker to update on load', async () => {
  Object.assign(env, { DEV: false, VITE_BUILD_HASH: 'same-hash', VITE_BUILD_TIME: '1000' });
  const update = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn().mockResolvedValue({ update, active: null });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ version: '0.0.8', hash: 'same-hash', buildTime: 1000 }),
  });
  vi.stubGlobal('fetch', fetchMock);

  const view = render(<Probe />);

  await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/^\/version\.json\?t=\d+$/),
    expect.objectContaining({ cache: 'no-store' }),
  ));
  view.unmount();
});

it('does not reload when version.json cannot be read', async () => {
  Object.assign(env, { DEV: false, VITE_BUILD_HASH: 'same-hash', VITE_BUILD_TIME: '1000' });
  const update = vi.fn().mockResolvedValue(undefined);
  const register = vi.fn().mockResolvedValue({ update, active: null });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register,
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

  function Status() {
    const { updating } = usePwaUpdatePrompt();
    return <p>{updating ? 'updating' : 'idle'}</p>;
  }
  const view = render(<Status />);
  await waitFor(() => expect(register).toHaveBeenCalled());
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(view.getByText('idle')).toBeInTheDocument();
  view.unmount();
});
