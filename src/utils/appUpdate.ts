/**
 * Decides when a running web client should reload onto a newly deployed build.
 * The embedded build hash is the source of truth for "what this tab is running".
 * version.json is the source of truth for "what production is serving".
 */

export const VERSION_RELOAD_KEY = 'ledgercraft:app-update-reload';
export const CONTROLLER_RELOAD_KEY = 'ledgercraft:app-update-controller';
export const APP_UPDATE_POLL_MS = 60_000;
export const APP_UPDATE_FOCUS_DEBOUNCE_MS = 1_000;
export const APP_UPDATE_TOAST_MS = 700;

const TEXT_LIKE_INPUT = new Set([
  '',
  'text',
  'search',
  'email',
  'password',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
]);

export interface BuildIdentity {
  hash: string;
  buildTime: number;
}

export type AppUpdateCause = 'version' | 'controller';

export type AppUpdatePlan =
  | { action: 'reload'; toast: boolean; mark: AppUpdateCause }
  | { action: 'defer'; mark: AppUpdateCause }
  | { action: 'skip'; reason: 'dev' | 'current' | 'placeholder' | 'already-reloaded' | 'first-controller' };

export interface AppUpdateInput {
  dev: boolean;
  cause: AppUpdateCause;
  current: BuildIdentity;
  server: BuildIdentity | null;
  versionReloadHash: string | null;
  controllerReloadHash: string | null;
  editing: boolean;
  hidden: boolean;
  hadController: boolean;
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

  // A hidden tab is not a safe moment to reload. Invoice and quote edits are
  // not restored after a reload, and location.reload bypasses the form blocker.
  if (input.editing) return { action: 'defer', mark: input.cause };
  return { action: 'reload', toast: !input.hidden, mark: input.cause };
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

function isTextLikeInput(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement
    && TEXT_LIKE_INPUT.has(element.type)
    && !element.disabled
    && !element.readOnly;
}

function isOpenTextField(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  return isTextLikeInput(element);
}

function isChoiceControl(element: Element): boolean {
  if (element instanceof HTMLSelectElement) return !element.disabled;
  return element instanceof HTMLInputElement
    && (element.type === 'checkbox' || element.type === 'radio')
    && !element.disabled;
}

function isDirtyChoice(element: Element): boolean {
  if (element instanceof HTMLSelectElement && !element.disabled) {
    return [...element.options].some(option => option.selected !== option.defaultSelected);
  }
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio') && !element.disabled) {
    return element.checked !== element.defaultChecked;
  }
  return false;
}

function isDirtyText(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement && !element.disabled && !element.readOnly) {
    return element.value !== element.defaultValue;
  }
  return isTextLikeInput(element) && element.value !== element.defaultValue;
}

/**
 * A form that publishes `data-unsaved-changes` owns the decision for its fields.
 * Invoice and quote screens set that from the form's unsaved-changes flag, so a
 * prefilled controlled input is not treated as an edit.
 */
function coveredByUnsavedFlag(element: Element): boolean {
  return element.closest('[data-unsaved-changes]') != null;
}

export function isMidFormEdit(doc: Document): boolean {
  if (doc.querySelector('[data-unsaved-changes="true"]')) return true;

  const active = doc.activeElement;
  if (active instanceof HTMLElement && active !== doc.body && !coveredByUnsavedFlag(active)) {
    if (active.isContentEditable) return true;
    if (isChoiceControl(active) || isOpenTextField(active)) return true;
  }

  for (const field of doc.querySelectorAll('input, textarea, select')) {
    if (coveredByUnsavedFlag(field)) continue;
    if (isDirtyChoice(field) || isDirtyText(field)) return true;
  }
  return false;
}

/**
 * Hold a reload until the next in-app navigation, and only if the document is
 * no longer being edited. Hiding the tab does not reload.
 */
export function deferAppReload(
  doc: Document,
  win: Window,
  reload: () => void,
  stillEditing: () => boolean = () => false,
): () => void {
  let stopped = false;
  const originalPush = win.history.pushState;

  const onPop = () => {
    if (!stillEditing()) finish();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    win.history.pushState = originalPush;
    win.removeEventListener('popstate', onPop);
  };
  const finish = () => {
    if (stopped) return;
    stop();
    reload();
  };
  const wrap = (original: History['pushState']) =>
    function (this: History, ...args: Parameters<History['pushState']>) {
      original.apply(this, args);
      if (!stillEditing()) finish();
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
