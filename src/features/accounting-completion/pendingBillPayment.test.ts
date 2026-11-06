import { beforeEach, expect, it } from 'vitest';
import { readPendingBillPayment, savePendingBillPayment } from './pendingBillPayment';
beforeEach(() => localStorage.clear());
it('isolates uncertain bill-payment keys by company and actor as well as bill', () => {
  const input = { bankAccountId: '11111111-1111-4111-8111-111111111111', amount: '69.00', paymentDate: '2026-04-22' };
  const saved = savePendingBillPayment('company-a', 'bill-a', input, 'actor-a');
  expect(readPendingBillPayment('company-a', 'bill-a', 'actor-a')).toEqual(saved);
  expect(() => readPendingBillPayment('company-a', 'bill-a', 'actor-b')).toThrow(/another user/i);
  expect(readPendingBillPayment('company-b', 'bill-a', 'actor-a')).toBeUndefined();
});
