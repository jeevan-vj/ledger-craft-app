import { AuthApiError } from '@/features/auth/api/http';
import { PAYMENT_METHOD_OPTIONS } from '@/utils/statusUtils';
import {
  createPaymentAttempt,
  formatPaymentAmount,
  formatPaymentHistory,
  invoicePaymentActions,
  mapPaymentError,
  paymentAmountError,
} from './paymentModel';

describe('payment decimal formatting', () => {
  it('formats exact decimal strings without converting them through Number', () => {
    expect(formatPaymentAmount('9007199254740993.25', 'NZD')).toBe('$9,007,199,254,740,993.25');
    expect(formatPaymentAmount('0.10', 'NZD')).toBe('$0.10');
    expect(formatPaymentAmount('115.50', 'NZD')).toBe('$115.50');
  });

  it('uses the payment method enum and keeps status read-only text', () => {
    expect(PAYMENT_METHOD_OPTIONS.map((method) => method.value)).toEqual([
      'bank_transfer',
      'cash',
      'cheque',
      'credit_card',
      'online',
    ]);
    expect(formatPaymentHistory({
      amount: '9007199254740993.25',
      paymentMethod: 'bank_transfer',
      paymentDate: '2026-10-25',
      referenceNumber: 'REF-9',
      status: 'completed',
    }, 'NZD')).toEqual({
      amount: '$9,007,199,254,740,993.25',
      method: 'Bank Transfer',
      date: '25 Oct 2026',
      reference: 'REF-9',
      status: 'Completed',
    });
  });
});

describe('payment amount validation', () => {
  it('accepts a positive amount within the balance and rejects anything over it', () => {
    expect(paymentAmountError('10.00', '10.00')).toBeNull();
    expect(paymentAmountError('0.01', '10.00')).toBeNull();
    expect(paymentAmountError('9007199254740993.24', '9007199254740993.25')).toBeNull();
    expect(paymentAmountError('0', '10.00')).toMatch(/positive/i);
    expect(paymentAmountError('9007199254740993.26', '9007199254740993.25')).toMatch(/balance/i);
    expect(paymentAmountError('10.01', '10.00')).toMatch(/balance/i);
  });
});

describe('payment idempotency key lifecycle', () => {
  it('reuses one key for a double tap and a retry, then mints a new key after an edit or success', () => {
    const keys = ['key-a', 'key-b', 'key-c'];
    const attempt = createPaymentAttempt(() => keys.shift() ?? 'missing');
    expect(attempt.claim('amount:10.00')).toBe('key-a');
    expect(attempt.claim('amount:10.00')).toBeNull();
    attempt.release();
    expect(attempt.claim('amount:10.00')).toBe('key-a');
    attempt.release();
    expect(attempt.claim('amount:12.00')).toBe('key-b');
    attempt.succeed();
    expect(attempt.claim('amount:12.00')).toBe('key-c');
  });

  it('drops the key after an idempotency conflict so the next submit is a new attempt', () => {
    let n = 0;
    const attempt = createPaymentAttempt(() => `key-${++n}`);
    expect(attempt.claim('amount:10.00')).toBe('key-1');
    attempt.resetKey();
    expect(attempt.claim('amount:10.00')).toBe('key-2');
  });
});

describe('payment error mapping', () => {
  it('asks for a balance refresh when the server rejects an amount over the balance', () => {
    const failure = mapPaymentError(
      new AuthApiError('Payment exceeds invoice balance', 400, 'PAYMENT_EXCEEDS_BALANCE', 'req-1'),
      true,
    );
    expect(failure).toMatchObject({ kind: 'exceeds_balance', refetch: true });
    expect(failure.message).toMatch(/balance/i);
    expect(failure.message).not.toMatch(/req-1|customer/i);
  });

  it('asks for a new key when the same attempt is sent with a different body', () => {
    const failure = mapPaymentError(
      new AuthApiError('Idempotency-Key was reused with a different request', 409, 'IDEMPOTENCY_CONFLICT'),
      true,
    );
    expect(failure).toMatchObject({ kind: 'idempotency_conflict', resetKey: true });
    expect(failure.message).toMatch(/different|conflict/i);
  });

  it('shows an offline error and does not describe a queued payment', () => {
    const failure = mapPaymentError(new AuthApiError('offline', 0, 'OFFLINE'), false);
    expect(failure.kind).toBe('offline');
    expect(failure.message).toMatch(/offline/i);
    expect(failure.message).toMatch(/not recorded|will not be sent/i);
    expect(failure.message).not.toMatch(/queue/i);
    expect(failure).not.toHaveProperty('queue');
  });
});

describe('paid invoice actions', () => {
  it('hides record payment and edit once the invoice is paid', () => {
    expect(invoicePaymentActions('paid')).toEqual({ recordPayment: false, edit: false });
    expect(invoicePaymentActions('sent')).toEqual({ recordPayment: true, edit: true });
    expect(invoicePaymentActions('overdue')).toEqual({ recordPayment: true, edit: true });
    expect(invoicePaymentActions('draft')).toEqual({ recordPayment: true, edit: true });
  });
});
