import { afterEach, expect, it, vi } from 'vitest';
import { reconciliationService } from '../reconciliationService';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('uses authoritative live book balances before completion instead of treating a null stored closing balance as zero', async () => {
  vi.stubEnv('VITE_RECONCILIATION_API', 'true');
  const session = { id: 'session', bankAccountId: 'bank', statementStartDate: '2026-04-01', statementEndDate: '2026-04-30', statementOpeningBalance: '0.00', statementClosingBalance: '-69.00', bookOpeningBalance: '0.00', bookClosingBalance: null, totalDeposits: '0.00', totalWithdrawals: '69.00', status: 'in_progress', reconciledAt: null, matchedCount: 1, unmatchedBankCount: 0, unmatchedBookCount: 0, adjustmentCount: 0, difference: '0.00', notes: null, createdAt: '2026-04-01', updatedAt: '2026-04-22' };
  const fetcher = vi.fn(async (path: string) => new Response(JSON.stringify(path.endsWith('/summary') ? { session, bankAccountName: 'Operating', bankName: 'Test', bankBalance: '-69.00', adjustedBankBalance: '-69.00', bookBalance: '-69.00', adjustedBookBalance: '-69.00', outstandingDeposits: [], outstandingChecks: [], otherAdjustments: [], totalOutstandingDeposits: '0.00', totalOutstandingChecks: '0.00', totalOtherAdjustments: '0.00', finalDifference: '0.00', isReconciled: true, warnings: ['Unposted fee excluded'] } : session), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  const result = await reconciliationService.generateSummary('session');
  expect(result).toMatchObject({ bookBalance: -69, adjustedBookBalance: -69, finalDifference: 0, isReconciled: true, warnings: ['Unposted fee excluded'] });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/reconciliation-sessions/session/summary');
});
