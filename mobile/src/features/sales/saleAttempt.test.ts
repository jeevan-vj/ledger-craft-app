import { AuthApiError } from '@/features/auth/api/http';
import {
  claimSaleAttempt,
  discardSaleAttempt,
  finishSaleAttempt,
  hydrateSaleAttempt,
  mapSaleError,
  OFFLINE_SALE_MESSAGE,
  readSaleAttempt,
  releaseSaleAttempt,
  resetSaleAttemptForTests,
  saleAttemptInFlight,
} from './saleAttempt';

describe('sale attempt', () => {
  beforeEach(() => {
    resetSaleAttemptForTests();
  });

  it('reuses one key for the same charge and mints a new key after success or a body change', () => {
    expect(claimSaleAttempt('same-body', () => 'key-1')).toBe('key-1');
    releaseSaleAttempt();
    expect(claimSaleAttempt('same-body', () => 'key-2')).toBe('key-1');
    releaseSaleAttempt();
    expect(claimSaleAttempt('edited-body', () => 'key-3')).toBe('key-3');
    finishSaleAttempt();
    expect(readSaleAttempt()).toBeNull();
    expect(claimSaleAttempt('edited-body', () => 'key-4')).toBe('key-4');
  });

  it('holds the in-flight lock until the attempt settles, including when dismiss does not release it', () => {
    expect(claimSaleAttempt('body', () => 'key-1')).toBe('key-1');
    expect(saleAttemptInFlight()).toBe(true);
    expect(claimSaleAttempt('body', () => 'key-2')).toBeNull();
    expect(claimSaleAttempt('other-body', () => 'key-3')).toBeNull();
    expect(readSaleAttempt()?.key).toBe('key-1');
    releaseSaleAttempt();
    expect(saleAttemptInFlight()).toBe(false);
    expect(claimSaleAttempt('body', () => 'key-4')).toBe('key-1');
  });

  it('reuses the stored key after the in-memory lock is cleared', () => {
    claimSaleAttempt('body', () => 'key-1');
    releaseSaleAttempt();
    const saved = readSaleAttempt();
    resetSaleAttemptForTests();
    expect(readSaleAttempt()).toBeNull();
    hydrateSaleAttempt(saved);
    expect(claimSaleAttempt('body', () => 'fresh')).toBe('key-1');
  });

  it('keeps each cart fingerprint key until that body succeeds or conflicts', () => {
    expect(claimSaleAttempt('original', () => 'key-1')).toBe('key-1');
    releaseSaleAttempt();
    expect(claimSaleAttempt('edited', () => 'key-2')).toBe('key-2');
    releaseSaleAttempt();
    expect(claimSaleAttempt('original', () => 'key-3')).toBe('key-1');
    finishSaleAttempt();
    expect(claimSaleAttempt('original', () => 'key-4')).toBe('key-4');
    releaseSaleAttempt();
    expect(claimSaleAttempt('edited', () => 'key-5')).toBe('key-2');
    discardSaleAttempt();
    expect(claimSaleAttempt('edited', () => 'key-6')).toBe('key-6');
    releaseSaleAttempt();
    expect(claimSaleAttempt('original', () => 'key-7')).toBe('key-4');
  });

  it('drops the key after an idempotency conflict and keeps the offline copy exact', () => {
    claimSaleAttempt('body', () => 'key-1');
    discardSaleAttempt();
    expect(readSaleAttempt()).toBeNull();
    expect(saleAttemptInFlight()).toBe(false);

    expect(mapSaleError(new Error('The request timed out'), true)).toEqual({
      message: 'The request timed out',
      resetKey: false,
    });
    expect(mapSaleError(new AuthApiError('offline', 0, 'OFFLINE'), false)).toEqual({
      message: OFFLINE_SALE_MESSAGE,
      resetKey: false,
    });
    expect(mapSaleError(new AuthApiError('Idempotency-Key was reused with a different request', 409, 'IDEMPOTENCY_CONFLICT'), true)).toEqual({
      message: 'This sale attempt conflicted with a different request. Check the cart and try again.',
      resetKey: true,
    });
  });
});
