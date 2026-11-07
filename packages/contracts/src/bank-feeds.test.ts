import { describe, expect, it } from 'vitest';
import { bankFeedSummarySchema } from './bank-feeds';
import { bankTransactionSchema } from './bank';
describe('bank feed contracts', () => {
  it('reports unconfigured and blocked full-app capability without any tokens', () => {
    expect(bankFeedSummarySchema.parse({ mode: 'unavailable', fullAppAvailable: false, status: 'not_connected', lastAttemptAt: null, lastSyncedAt: null, nextSyncAt: null, accounts: [], warnings: ['Personal App credentials are required.'] }).mode).toBe('unavailable');
  });
  it('accepts source feed in existing transaction DTO', () => {
    expect(bankTransactionSchema.shape.source.parse('feed')).toBe('feed');
  });
});
