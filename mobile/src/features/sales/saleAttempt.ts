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

export function resetSaleAttemptForTests() {
  inFlight = false;
  pending = null;
}

export function hydrateSaleAttempt(record: SaleAttemptRecord | null) {
  pending = record;
  inFlight = false;
}

export function readSaleAttempt(): SaleAttemptRecord | null {
  return pending;
}

export function saleAttemptInFlight(): boolean {
  return inFlight;
}

export function claimSaleAttempt(fingerprint: string, createKey: () => string = randomId): string | null {
  if (inFlight) return null;
  const key = pending?.fingerprint === fingerprint ? pending.key : createKey();
  pending = { fingerprint, key };
  inFlight = true;
  return key;
}

export function releaseSaleAttempt() {
  inFlight = false;
}

export function finishSaleAttempt() {
  inFlight = false;
  pending = null;
}

export function discardSaleAttempt() {
  inFlight = false;
  pending = null;
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
