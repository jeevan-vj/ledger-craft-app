export type SentryState = 'idle' | 'loading' | 'ready' | 'disabled';

export type QueuedError = {
  error: unknown;
  componentStack?: string | null;
};

export type QueuedApiFailure = {
  status: number;
  code?: string;
  requestId?: string;
};

type LiveSentry = {
  report: (error: unknown, componentStack?: string | null) => string | undefined;
  user: (userId: string | null) => void;
  crumb: (failure: QueuedApiFailure) => void;
};

let state: SentryState = 'idle';
let live: LiveSentry | null = null;
const queuedErrors: QueuedError[] = [];
const queuedCrumbs: QueuedApiFailure[] = [];
let queuedUser: { set: boolean; id: string | null } = { set: false, id: null };

export function sentryState(): SentryState {
  return state;
}

export function setSentryState(next: SentryState): void {
  state = next;
}

export function reportOrQueue(error: unknown, componentStack?: string | null): string | undefined {
  if (live) return live.report(error, componentStack);
  if (state !== 'loading') return undefined;
  queuedErrors.push({ error, componentStack });
  return undefined;
}

export function rememberUser(userId: string | null): void {
  if (state === 'disabled' || state === 'idle') return;
  queuedUser = { set: true, id: userId };
  live?.user(userId);
}

export function rememberApiFailure(failure: QueuedApiFailure): void {
  if (state !== 'loading' && state !== 'ready') return;
  if (live) {
    live.crumb(failure);
    return;
  }
  queuedCrumbs.push(failure);
}

export function bindSentryLive(next: LiveSentry): void {
  live = next;
  if (queuedUser.set) next.user(queuedUser.id);
  for (const crumb of queuedCrumbs.splice(0)) next.crumb(crumb);
  for (const item of queuedErrors.splice(0)) next.report(item.error, item.componentStack);
}
