import { afterEach, expect, it, vi } from 'vitest';
import { journalsApi } from './journalsApi';
afterEach(() => vi.unstubAllGlobals());
it('retains every posting line and exact server debit/credit totals for a compound journal', async () => {
  const lines = [{ id: 'cost', accountId: 'expense', accountName: 'Contracting', debitAmount: '1000.00', creditAmount: '0.00', description: 'Work', lineOrder: 1 }, { id: 'gst', accountId: 'gst', accountName: 'GST paid', debitAmount: '150.00', creditAmount: '0.00', description: 'GST', lineOrder: 2 }, { id: 'ap', accountId: 'ap', accountName: 'Accounts Payable', debitAmount: '0.00', creditAmount: '1150.00', description: 'Bill', lineOrder: 3 }];
  const dto = { id: 'journal', entryNumber: 'JE-001', entryDate: '2026-10-10', description: 'Received bill', referenceNumber: null, debitAccountId: 'expense', debitAccountName: 'Contracting', debitAmount: '1000.00', creditAccountId: 'ap', creditAccountName: 'Accounts Payable', creditAmount: '1150.00', lines, debitTotal: '1150.00', creditTotal: '1150.00', status: 'posted', notes: null, createdAt: '2026-10-10', updatedAt: '2026-10-10' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ journalEntries: [dto] }), { status: 200 })));
  const [entry] = await journalsApi.list();
  expect(entry).toMatchObject({ lines, debitTotal: '1150.00', creditTotal: '1150.00' });
});
