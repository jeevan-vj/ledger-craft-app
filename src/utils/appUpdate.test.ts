import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_UPDATE_FOCUS_DEBOUNCE_MS,
  APP_UPDATE_POLL_MS,
  clearControllerReloadIfUpdated,
  clearVersionReloadIfCurrent,
  deferAppReload,
  isMidFormEdit,
  planAppUpdate,
  watchAppUpdateSignals,
  type BuildIdentity,
} from './appUpdate';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const current: BuildIdentity = { hash: 'embedded-hash', buildTime: 1000 };
const deployed: BuildIdentity = { hash: 'deployed-hash', buildTime: 2000 };

function plan(overrides: Partial<Parameters<typeof planAppUpdate>[0]> = {}) {
  return planAppUpdate({
    dev: false,
    cause: 'version',
    current,
    server: deployed,
    versionReloadHash: null,
    controllerReloadHash: null,
    editing: false,
    hidden: false,
    hadController: true,
    ...overrides,
  });
}

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('planAppUpdate', () => {
  it('reloads when the deployed build is newer than the running build', () => {
    expect(plan()).toEqual({ action: 'reload', toast: true, mark: 'version' });
  });

  it('does not ignore that newer build just because it is the first comparison', () => {
    expect(plan({ versionReloadHash: null }).action).toBe('reload');
  });

  it('does not reload when version.json matches the running build', () => {
    expect(plan({ server: current })).toEqual({ action: 'skip', reason: 'current' });
  });

  it('does not reload for a placeholder version.json', () => {
    expect(plan({ server: { hash: 'initial', buildTime: 0 } })).toEqual({ action: 'skip', reason: 'placeholder' });
    expect(plan({ server: { hash: 'development', buildTime: 2000 } })).toEqual({ action: 'skip', reason: 'placeholder' });
  });

  it('does not reload when the deployed build is older', () => {
    expect(plan({ server: { hash: 'older-hash', buildTime: 500 } })).toEqual({ action: 'skip', reason: 'current' });
  });

  it('does not reload again for a build that already triggered a reload', () => {
    expect(plan({ versionReloadHash: deployed.hash })).toEqual({ action: 'skip', reason: 'already-reloaded' });
  });

  it('still reloads when a new service worker takes control after a version reload was recorded', () => {
    expect(plan({
      cause: 'controller',
      versionReloadHash: deployed.hash,
      server: null,
    })).toEqual({ action: 'reload', toast: true, mark: 'controller' });
  });

  it('does not reload on the first service worker claim', () => {
    expect(plan({ cause: 'controller', hadController: false, server: null })).toEqual({
      action: 'skip',
      reason: 'first-controller',
    });
  });

  it('does not controller-reload again while the running build is unchanged', () => {
    expect(plan({
      cause: 'controller',
      server: null,
      controllerReloadHash: current.hash,
    })).toEqual({ action: 'skip', reason: 'already-reloaded' });
  });

  it('allows a later controller change once the running build has moved on', () => {
    expect(plan({
      cause: 'controller',
      server: null,
      controllerReloadHash: 'previous-hash',
    }).action).toBe('reload');
  });

  it('waits while a text field is being edited', () => {
    expect(plan({ editing: true })).toEqual({ action: 'defer', mark: 'version' });
  });

  it('reloads a hidden tab even if a form is dirty', () => {
    expect(plan({ editing: true, hidden: true })).toEqual({ action: 'reload', toast: false, mark: 'version' });
  });

  it('skips update checks during development', () => {
    expect(plan({ dev: true })).toEqual({ action: 'skip', reason: 'dev' });
  });
});

describe('reload flags', () => {
  it('clears the version loop guard after the reloaded document is the target build', () => {
    sessionStorage.setItem('ledgercraft:app-update-reload', current.hash);
    clearVersionReloadIfCurrent(sessionStorage, current.hash);
    expect(sessionStorage.getItem('ledgercraft:app-update-reload')).toBeNull();
    sessionStorage.setItem('ledgercraft:app-update-reload', deployed.hash);
    clearVersionReloadIfCurrent(sessionStorage, current.hash);
    expect(sessionStorage.getItem('ledgercraft:app-update-reload')).toBe(deployed.hash);
  });

  it('clears a controller flag that belongs to an older build', () => {
    sessionStorage.setItem('ledgercraft:app-update-controller', 'previous-hash');
    clearControllerReloadIfUpdated(sessionStorage, current.hash);
    expect(sessionStorage.getItem('ledgercraft:app-update-controller')).toBeNull();
    sessionStorage.setItem('ledgercraft:app-update-controller', current.hash);
    clearControllerReloadIfUpdated(sessionStorage, current.hash);
    expect(sessionStorage.getItem('ledgercraft:app-update-controller')).toBe(current.hash);
  });
});

describe('isMidFormEdit', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('is false when nothing is being edited', () => {
    expect(isMidFormEdit(document)).toBe(false);
  });

  it('is true while a text field is focused or dirty', () => {
    const input = document.createElement('input');
    input.type = 'email';
    document.body.append(input);
    input.focus();
    expect(isMidFormEdit(document)).toBe(true);

    input.blur();
    input.defaultValue = '';
    input.value = 'owner@example.com';
    expect(isMidFormEdit(document)).toBe(true);
  });

  it('ignores checkboxes and disabled fields', () => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    const locked = document.createElement('input');
    locked.disabled = true;
    locked.value = 'filled by the page';
    document.body.append(box, locked);
    expect(isMidFormEdit(document)).toBe(false);
  });
});

describe('deferAppReload', () => {
  it('reloads on the next in-app navigation while a form is dirty', () => {
    const reload = vi.fn();
    const stop = deferAppReload(document, window, reload);
    window.history.pushState({}, '', '/invoices');
    expect(reload).toHaveBeenCalledOnce();
    window.history.pushState({}, '', '/customers');
    expect(reload).toHaveBeenCalledOnce();
    stop();
  });

  it('reloads when the tab is hidden', () => {
    const reload = vi.fn();
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const stop = deferAppReload(document, window, reload);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reload).toHaveBeenCalledOnce();
    stop();
    Reflect.deleteProperty(document, 'hidden');
  });
});

describe('watchAppUpdateSignals', () => {
  it('checks on load, on focus, and when the tab becomes visible', () => {
    vi.useFakeTimers();
    const onCheck = vi.fn();
    const stop = watchAppUpdateSignals(onCheck);
    expect(onCheck).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(APP_UPDATE_FOCUS_DEBOUNCE_MS - 1);
    expect(onCheck).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(onCheck).toHaveBeenCalledTimes(2);

    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(APP_UPDATE_FOCUS_DEBOUNCE_MS);
    expect(onCheck).toHaveBeenCalledTimes(2);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(APP_UPDATE_FOCUS_DEBOUNCE_MS);
    expect(onCheck).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(APP_UPDATE_POLL_MS);
    expect(onCheck).toHaveBeenCalledTimes(4);

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(onCheck).toHaveBeenCalledTimes(5);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(onCheck).toHaveBeenCalledTimes(5);

    stop();
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(APP_UPDATE_FOCUS_DEBOUNCE_MS);
    expect(onCheck).toHaveBeenCalledTimes(5);
    Reflect.deleteProperty(document, 'hidden');
  });
});

describe('published cache contract', () => {
  it('keeps the app shell revalidating and workbox files immutable', () => {
    const headers = readFileSync(path.join(repoRoot, 'public/_headers'), 'utf8');
    const blocks = new Map<string, Record<string, string>>();
    let currentPath: string | null = null;
    for (const line of headers.split('\n')) {
      if (line.trim() === '') continue;
      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        currentPath = line.trim();
        blocks.set(currentPath, {});
        continue;
      }
      if (!currentPath) continue;
      const separator = line.indexOf(':');
      blocks.get(currentPath)![line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
    expect(blocks.get('/sw.js')).toMatchObject({ 'cache-control': 'no-cache' });
    expect(blocks.get('/version.json')).toMatchObject({ 'cache-control': 'no-store' });
    expect(blocks.get('/index.html')).toMatchObject({ 'cache-control': 'no-cache' });
    expect(blocks.get('/workbox-*.js')).toMatchObject({
      'cache-control': 'public, max-age=31536000, immutable',
    });

    const viteConfig = readFileSync(path.join(repoRoot, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('navigateFallback: null');
    expect(viteConfig).toContain('directoryIndex: null');
    expect(viteConfig).toContain("globPatterns: ['**/*.{js,wasm,css}']");
  });
});
