/**
 * Decides when a running web client should reload onto a newly deployed build.
 * The embedded build hash is the source of truth for "what this tab is running".
 * version.json is the source of truth for "what production is serving".
 */

export const VERSION_RELOAD_KEY = 'ledgercraft:app-update-reload';
export const CONTROLLER_RELOAD_KEY = 'ledgercraft:app-update-controller';
export const APP_UPDATE_POLL_MS = 60_000;
export const APP_UPDATE_FOCUS_DEBOUNCE_MS = 1_000;
export interface BuildIdentity {
  hash: string;
  buildTime: number;
}

export type AppUpdateCause = 'version' | 'controller';

export type AppUpdatePlan =
  | { action: 'prompt'; mark: AppUpdateCause }
  | { action: 'defer'; mark: AppUpdateCause }
  | { action: 'skip'; reason: 'dev' | 'current' | 'placeholder' | 'already-reloaded' | 'first-controller' };

export interface AppUpdateInput {
  dev: boolean;
  cause: AppUpdateCause;
  current: BuildIdentity;
  server: BuildIdentity | null;
  versionReloadHash: string | null;
  controllerReloadHash: string | null;
  /** Invoice, quote, bill, or expense editor is mounted, or it has unsaved changes. */
  editor: boolean;
  hadController: boolean;
}

const EDITOR_ROUTES = [
  /^\/invoices\/(?:new|create)\/?$/,
  /^\/invoices\/[^/]+\/edit\/?$/,
  /^\/quotes\/new\/?$/,
  /^\/quotes\/[^/]+\/edit\/?$/,
  /^\/bills\/new\/?$/,
  /^\/bills\/[^/]+\/edit\/?$/,
];

export function isEditorPath(pathname: string): boolean {
  return EDITOR_ROUTES.some((pattern) => pattern.test(pathname));
}

export function isReloadableServerBuild(server: BuildIdentity): boolean {
  return server.buildTime > 0
    && server.hash !== ''
    && server.hash !== 'initial'
    && server.hash !== 'development';
}

export function isNewerDeployedBuild(current: BuildIdentity, server: BuildIdentity): boolean {
  if (!isReloadableServerBuild(server)) return false;
  if (server.hash === current.hash) return false;
  return server.buildTime > current.buildTime;
}

export function planAppUpdate(input: AppUpdateInput): AppUpdatePlan {
  if (input.dev) return { action: 'skip', reason: 'dev' };

  if (input.cause === 'controller') {
    if (!input.hadController) return { action: 'skip', reason: 'first-controller' };
    if (input.controllerReloadHash === input.current.hash) {
      return { action: 'skip', reason: 'already-reloaded' };
    }
  } else {
    if (!input.server || !isReloadableServerBuild(input.server)) {
      return { action: 'skip', reason: 'placeholder' };
    }
    if (input.versionReloadHash === input.server.hash) {
      return { action: 'skip', reason: 'already-reloaded' };
    }
    if (!isNewerDeployedBuild(input.current, input.server)) {
      return { action: 'skip', reason: 'current' };
    }
  }

  // Editors keep their document. The Reload button is the only reload there.
  // Everywhere else, the next in-app navigation does a full document load.
  // Hiding the tab is never a reason to reload.
  if (input.editor) return { action: 'prompt', mark: input.cause };
  return { action: 'defer', mark: input.cause };
}

export function clearVersionReloadIfCurrent(storage: Storage, currentHash: string): void {
  if (storage.getItem(VERSION_RELOAD_KEY) === currentHash) storage.removeItem(VERSION_RELOAD_KEY);
}

export function clearControllerReloadIfUpdated(storage: Storage, currentHash: string): void {
  const flag = storage.getItem(CONTROLLER_RELOAD_KEY);
  if (flag && flag !== currentHash) storage.removeItem(CONTROLLER_RELOAD_KEY);
}

export function markVersionReload(storage: Storage, hash: string): void {
  storage.setItem(VERSION_RELOAD_KEY, hash);
}

export function markControllerReload(storage: Storage, hash: string): void {
  storage.setItem(CONTROLLER_RELOAD_KEY, hash);
}

/**
 * Hold a reload until the next in-app navigation. Hiding the tab does not reload.
 * The caller must not arm this while a document editor is mounted.
 */
export function deferAppReload(
  win: Window,
  reload: () => void,
  blocked: () => boolean = () => false,
): () => void {
  let stopped = false;
  const originalPush = win.history.pushState;

  const finish = () => {
    if (stopped || blocked()) return;
    stop();
    reload();
  };
  const onPop = () => finish();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    win.history.pushState = originalPush;
    win.removeEventListener('popstate', onPop);
  };
  const wrap = (original: History['pushState']) =>
    function (this: History, ...args: Parameters<History['pushState']>) {
      original.apply(this, args);
      finish();
    };

  win.history.pushState = wrap(originalPush);
  win.addEventListener('popstate', onPop);
  return stop;
}

export function watchAppUpdateSignals(
  onCheck: () => void,
  doc: Document = document,
  win: Window = window,
): () => void {
  let debounce = 0;
  const run = () => onCheck();
  const schedule = () => {
    win.clearTimeout(debounce);
    debounce = win.setTimeout(run, APP_UPDATE_FOCUS_DEBOUNCE_MS);
  };
  const onVisibility = () => {
    if (!doc.hidden) schedule();
  };
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) run();
  };

  run();
  const interval = win.setInterval(run, APP_UPDATE_POLL_MS);
  win.addEventListener('focus', schedule);
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pageshow', onPageShow);
  return () => {
    win.clearTimeout(debounce);
    win.clearInterval(interval);
    win.removeEventListener('focus', schedule);
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pageshow', onPageShow);
  };
}
