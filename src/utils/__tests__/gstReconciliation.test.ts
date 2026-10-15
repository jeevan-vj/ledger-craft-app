import { describe, expect, it } from 'vitest';
import {
  amountsMatch,
  evaluateAccountCoverage,
  evaluateGstFigures,
  evaluateGstPeriodReconciliation,
  periodsOverlap,
  sessionCoversPeriod,
} from '../gstReconciliation';

const period = { startDate: '2026-01-01', endDate: '2026-03-31' };

const account = {
  id: 'acc-1',
  accountName: 'Business cheque',
  bankName: 'ANZ',
};

describe('gstReconciliation', () => {
  it('detects overlapping periods', () => {
    expect(periodsOverlap('2026-01-01', '2026-01-31', '2026-01-15', '2026-03-31')).toBe(true);
    expect(periodsOverlap('2026-01-01', '2026-01-31', '2026-02-01', '2026-03-31')).toBe(false);
  });

  it('requires a session to cover the full GST period', () => {
    expect(
      sessionCoversPeriod(
        {
          id: 's1',
          bankAccountId: 'acc-1',
          statementStartDate: '2026-01-01',
          statementEndDate: '2026-03-31',
          status: 'completed',
          unmatchedBankCount: 0,
        },
        period
      )
    ).toBe(true);

    expect(
      sessionCoversPeriod(
        {
          id: 's2',
          bankAccountId: 'acc-1',
          statementStartDate: '2026-01-01',
          statementEndDate: '2026-02-28',
          status: 'completed',
          unmatchedBankCount: 0,
        },
        period
      )
    ).toBe(false);
  });

  it('marks a completed covering session as complete', () => {
    const coverage = evaluateAccountCoverage(
      account,
      [
        {
          id: 's1',
          bankAccountId: 'acc-1',
          statementStartDate: '2026-01-01',
          statementEndDate: '2026-03-31',
          status: 'completed',
          unmatchedBankCount: 0,
        },
      ],
      period
    );
    expect(coverage.status).toBe('complete');
    expect(coverage.sessionId).toBe('s1');
  });

  it('marks an in-progress overlapping session', () => {
    const coverage = evaluateAccountCoverage(
      account,
      [
        {
          id: 's1',
          bankAccountId: 'acc-1',
          statementStartDate: '2026-01-01',
          statementEndDate: '2026-03-31',
          status: 'in_progress',
          unmatchedBankCount: 4,
        },
      ],
      period
    );
    expect(coverage.status).toBe('in_progress');
    expect(coverage.unmatchedBankCount).toBe(4);
  });

  it('marks missing coverage when there are no sessions', () => {
    expect(evaluateAccountCoverage(account, [], period).status).toBe('missing');
  });

  it('compares GST return figures against the books', () => {
    const lines = evaluateGstFigures(
      { totalSales: 1150, gstOnSales: 150, totalPurchases: 230, gstOnPurchases: 30 },
      { totalSales: 1150, gstOnSales: 150, totalPurchases: 240, gstOnPurchases: 30 }
    );
    expect(lines.find((line) => line.id === 'totalPurchases')?.difference).toBe(10);
    expect(amountsMatch(1150, 1150)).toBe(true);
  });

  it('is ready when bank recs and GST figures both match', () => {
    const result = evaluateGstPeriodReconciliation({
      period,
      accounts: [account],
      sessions: [
        {
          id: 's1',
          bankAccountId: 'acc-1',
          statementStartDate: '2026-01-01',
          statementEndDate: '2026-03-31',
          status: 'completed',
          unmatchedBankCount: 0,
        },
      ],
      unreconciledTransactionCount: 0,
      unreconciledSamples: [],
      books: { totalSales: 1150, gstOnSales: 150, totalPurchases: 230, gstOnPurchases: 30 },
      returnValues: { totalSales: 1150, gstOnSales: 150, totalPurchases: 230, gstOnPurchases: 30 },
    });

    expect(result.readiness).toBe('ready');
    expect(result.issues).toEqual([]);
  });

  it('warns when bank recs or GST figures are incomplete', () => {
    const result = evaluateGstPeriodReconciliation({
      period,
      accounts: [account],
      sessions: [],
      unreconciledTransactionCount: 2,
      unreconciledSamples: [],
      books: { totalSales: 1150, gstOnSales: 150, totalPurchases: 230, gstOnPurchases: 30 },
      returnValues: { totalSales: 1200, gstOnSales: 150, totalPurchases: 230, gstOnPurchases: 30 },
    });

    expect(result.readiness).toBe('warning');
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('skips bank coverage when there are no bank accounts', () => {
    const result = evaluateGstPeriodReconciliation({
      period,
      accounts: [],
      sessions: [],
      unreconciledTransactionCount: 0,
      unreconciledSamples: [],
      books: { totalSales: 0, gstOnSales: 0, totalPurchases: 0, gstOnPurchases: 0 },
      returnValues: { totalSales: 0, gstOnSales: 0, totalPurchases: 0, gstOnPurchases: 0 },
    });

    expect(result.readiness).toBe('not_applicable');
  });
});
