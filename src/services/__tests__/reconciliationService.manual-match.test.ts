import { afterEach, expect, it, vi } from 'vitest';
import { reconciliationService } from '../reconciliationService';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(['payment', 'expense', 'bill_payment'] as const)('confirms an explicitly selected manual %s match instead of leaving it pending', async (type) => {
  vi.stubEnv('VITE_RECONCILIATION_API', 'true');
  const fetcher = vi.fn(async (_path: string, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'match', reconciliationId: 'session', bankTransactionId: input.bankTransactionId, invoiceId: null, paymentId: type === 'payment' ? 'book' : null, billPaymentId: type === 'bill_payment' ? 'book' : null, expenseId: type === 'expense' ? 'book' : null, journalEntryId: null, matchType: 'manual', confidenceScore: 100, bankAmount: '69.00', bookAmount: '69.00', difference: '0.00', status: input.status ?? 'pending', notes: null, matchedAt: '2026-04-22T00:00:00.000Z', createdAt: '2026-04-22T00:00:00.000Z' }), { status: 201 });
  });
  vi.stubGlobal('fetch', fetcher);
  const match = await reconciliationService.createMatch('session', 'bank-row', type, 'book');
  expect(match.status).toBe('confirmed');
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ bankTransactionId: 'bank-row', bookItemType: type, bookItemId: 'book', status: 'confirmed' });
});
