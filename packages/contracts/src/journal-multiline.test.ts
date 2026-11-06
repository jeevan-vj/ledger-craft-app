import { describe, expect, it } from 'vitest';
import { journalEntrySchema } from './index';

const legacy = { id: '11111111-1111-4111-8111-111111111111', entryNumber: 'JE-2026-1', entryDate: '2026-10-15', description: 'Sales invoice', referenceNumber: null, debitAccountId: '22222222-2222-4222-8222-222222222222', debitAccountName: 'Receivables', debitAmount: '2300.00', creditAccountId: '33333333-3333-4333-8333-333333333333', creditAccountName: 'Revenue', creditAmount: '2000.00', status: 'posted', notes: null, createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z' };
describe('full journal line response contract', () => {
  it('retains exact totals and all line account assignments through the public schema', () => {
    const lines = [
      { id: '44444444-4444-4444-8444-444444444444', accountId: legacy.debitAccountId, accountName: 'Receivables', debitAmount: '2300.00', creditAmount: '0.00', description: 'Invoice total', lineOrder: 1 },
      { id: '55555555-5555-4555-8555-555555555555', accountId: legacy.creditAccountId, accountName: 'Revenue', debitAmount: '0.00', creditAmount: '2000.00', description: 'Services', lineOrder: 2 },
      { id: '66666666-6666-4666-8666-666666666666', accountId: '77777777-7777-4777-8777-777777777777', accountName: 'Output GST', debitAmount: '0.00', creditAmount: '300.00', description: 'GST', lineOrder: 3 },
    ];
    const value = journalEntrySchema.parse({ ...legacy, lines, debitTotal: '2300.00', creditTotal: '2300.00' });
    expect(value).toMatchObject({ lines, debitTotal: '2300.00', creditTotal: '2300.00' });
  });
  it('continues accepting legacy two-account response fixtures without optional new fields', () => {
    expect(journalEntrySchema.parse(legacy).creditAmount).toBe('2000.00');
  });
});
