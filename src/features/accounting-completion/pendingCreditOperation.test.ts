import { beforeEach, expect, it } from 'vitest';
import { clearPendingCredit, readPendingCredits, savePendingCreditIssue, savePendingCreditRefund } from './pendingCreditOperation';
beforeEach(() => localStorage.clear());
it('binds pending credit and refund operations to company, actor and source', () => {
  const invoice = '11111111-1111-4111-8111-111111111111';
  const input = { invoiceId: invoice, issueDate: '2026-04-15', reason: 'Returned consulting service', taxInclusive: false, taxRate: '15', items: [{ description: 'Credit', quantity: '1', rate: '200.00' }] };
  const issue = savePendingCreditIssue('company-a', 'owner-a', invoice, input);
  const refund = savePendingCreditRefund('company-a', 'owner-a', invoice, 'note-a', { amount: '230.00', refundDate: '2026-04-17', bankAccountId: '22222222-2222-4222-8222-222222222222' });
  expect(readPendingCredits('company-a', 'owner-a', invoice)).toEqual({ issue, refunds: { 'note-a': refund } });
  expect(() => readPendingCredits('company-a', 'owner-b', invoice)).toThrow(/another user/i);
  expect(readPendingCredits('company-b', 'owner-a', invoice)).toEqual({ issue: undefined, refunds: {} });
  clearPendingCredit('company-a', 'owner-a', invoice, 'issue');
  expect(readPendingCredits('company-a', 'owner-a', invoice)).toEqual({ issue: undefined, refunds: { 'note-a': refund } });
});
