import { AuthApiError } from '@/features/auth/api/http';
import { randomId } from '@/utils/id';

export const OFFLINE_SALE_MESSAGE = "You're offline. Sales can't be saved until you're back online.";
export const SALE_IN_FLIGHT_MESSAGE = 'A sale is already being recorded. Wait until it finishes.';

export interface SaleAttemptRecord {
  fingerprint: string;
  key: string;
}

export interface SaleFailure {
  message: string;
  resetKey: boolean;
}

let inFlight = false;
let pending: SaleAttemptRecord | null = null;
let keys = new Map<string, string>();

export function resetSaleAttemptForTests() {
  inFlight = false;
  pending = null;
  keys = new Map();
}

export function hydrateSaleAttempt(record: (SaleAttemptRecord & { keys?: Record<string, string> }) | null) {
  keys = new Map();
  pending = null;
  inFlight = false;
  if (!record) return;
  for (const [fingerprint, key] of Object.entries(record.keys ?? {})) {
    if (fingerprint && key) keys.set(fingerprint, key);
  }
  if (record.fingerprint && record.key) keys.set(record.fingerprint, record.key);
  pending = { fingerprint: record.fingerprint, key: record.key };
}

export function readSaleAttempt(): (SaleAttemptRecord & { keys: Record<string, string> }) | null {
  if (!pending) return null;
  return { ...pending, keys: Object.fromEntries(keys) };
}

export function saleAttemptKeys(): Record<string, string> {
  return Object.fromEntries(keys);
}

export function saleAttemptInFlight(): boolean {
  return inFlight;
}

export function claimSaleAttempt(fingerprint: string, createKey: () => string = randomId): string | null {
  if (inFlight) return null;
  let key = keys.get(fingerprint);
  if (!key) {
    key = createKey();
    keys.set(fingerprint, key);
  }
  pending = { fingerprint, key };
  inFlight = true;
  return key;
}

export function releaseSaleAttempt() {
  inFlight = false;
}

function dropPendingKey() {
  if (pending) keys.delete(pending.fingerprint);
  pending = null;
}

export function finishSaleAttempt() {
  inFlight = false;
  dropPendingKey();
}

export function discardSaleAttempt() {
  inFlight = false;
  dropPendingKey();
}

export function mapSaleError(error: unknown, online: boolean): SaleFailure {
  const apiError = error instanceof AuthApiError ? error : null;
  if (!online || apiError?.status === 0 || apiError?.code === 'OFFLINE') {
    return { message: OFFLINE_SALE_MESSAGE, resetKey: false };
  }
  if (apiError?.status === 409 && apiError.code === 'IDEMPOTENCY_CONFLICT') {
    return {
      message: 'This sale attempt conflicted with a different request. Check the cart and try again.',
      resetKey: true,
    };
  }
  if (error instanceof Error && error.message.trim()) return { message: error.message, resetKey: false };
  return { message: 'The sale could not be saved.', resetKey: false };
}
