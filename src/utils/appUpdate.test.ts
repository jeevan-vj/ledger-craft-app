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
  isEditorPath,
  planAppUpdate,
  watchAppUpdateSignals,
  type BuildIdentity,
} from './appUpdate';
import { documentEditorBlocksReload, registerDocumentEditor } from './documentEditor';

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
    editor: false,
    hadController: true,
    ...overrides,
  });
}

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('planAppUpdate', () => {
  it('waits for the next navigation when a newer build is deployed off an editor', () => {
    expect(plan()).toEqual({ action: 'defer', mark: 'version' });
  });

  it('does not ignore that newer build just because it is the first comparison', () => {
    expect(plan({ versionReloadHash: null }).action).toBe('defer');
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

  it('still waits for navigation when a new service worker takes control off an editor', () => {
    expect(plan({
      cause: 'controller',
      versionReloadHash: deployed.hash,
      server: null,
    })).toEqual({ action: 'defer', mark: 'controller' });
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
    }).action).toBe('defer');
  });

  it('offers Reload instead of reloading while an editor is open, even if the tab is hidden', () => {
    expect(plan({ editor: true })).toEqual({ action: 'prompt', mark: 'version' });
    expect(plan({ editor: true })).toEqual({ action: 'prompt', mark: 'version' });
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

describe('document editors', () => {
  it('blocks a reload while an editor is mounted, including a clean expense drawer', () => {
    expect(documentEditorBlocksReload()).toBe(false);
    const stop = registerDocumentEditor({ dirty: false });
    expect(documentEditorBlocksReload()).toBe(true);
    stop();
    expect(documentEditorBlocksReload()).toBe(false);
  });
});

describe('isEditorPath', () => {
  it('matches invoice, quote, and bill editors and not their list pages', () => {
    expect(isEditorPath('/invoices/new')).toBe(true);
    expect(isEditorPath('/invoices/create')).toBe(true);
    expect(isEditorPath('/invoices/inv-1/edit')).toBe(true);
    expect(isEditorPath('/quotes/new')).toBe(true);
    expect(isEditorPath('/quotes/q-1/edit')).toBe(true);
    expect(isEditorPath('/bills/new')).toBe(true);
    expect(isEditorPath('/bills/bill-1/edit')).toBe(true);
    expect(isEditorPath('/invoices')).toBe(false);
    expect(isEditorPath('/quotes')).toBe(false);
    expect(isEditorPath('/expenses')).toBe(false);
  });
});

describe('deferAppReload', () => {
  it('reloads on the next in-app navigation and not when the tab is hidden', () => {
    const reload = vi.fn();
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const stop = deferAppReload(window, reload);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reload).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/customers');
    expect(reload).toHaveBeenCalledOnce();
    stop();
    Reflect.deleteProperty(document, 'hidden');
  });

  it('does not reload a navigation while an editor is still open', () => {
    const reload = vi.fn();
    let open = true;
    const stop = deferAppReload(window, reload, () => open);
    window.history.pushState({}, '', '/invoices');
    expect(reload).not.toHaveBeenCalled();
    open = false;
    window.history.pushState({}, '', '/customers');
    expect(reload).toHaveBeenCalledOnce();
    stop();
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
