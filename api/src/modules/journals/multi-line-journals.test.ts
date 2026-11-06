import { journalEntryListResponseSchema, journalEntrySchema } from '@ledgercraft/contracts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';

describe('complete journal presentation', () => {
  it('shows all AR2300/revenue2000/GST300 lines and balanced totals for a real posted invoice', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-15', dueDate: '2026-10-31', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'October services', quantity: '1', rate: '2000' }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      const list = journalEntryListResponseSchema.parse(await f.request('/api/journal-entries', 'GET'));
      const entry = list.journalEntries.find(row => row.debitAmount === '2300.00');
      expect(entry).toBeDefined();
      expect(entry).toMatchObject({ debitTotal: '2300.00', creditTotal: '2300.00' });
      expect(entry?.lines).toHaveLength(3);
      expect(entry?.lines?.map(row => ({ debit: row.debitAmount, credit: row.creditAmount }))).toEqual([
        { debit: '2300.00', credit: '0.00' }, { debit: '0.00', credit: '2000.00' }, { debit: '0.00', credit: '300.00' },
      ]);
      expect(entry?.lines?.every(row => row.accountName.length > 0)).toBe(true);
      // Legacy fields still describe their specific first account, not all
      // journal credits falsely attributed to the revenue account.
      expect(entry).toMatchObject({ debitAmount: '2300.00', creditAmount: '2000.00' });
      const detail = journalEntrySchema.parse(await f.request(`/api/journal-entries/${entry!.id}`, 'GET'));
      expect(detail).toEqual(entry);
      const directory = process.env.ACCOUNTING_EVIDENCE_DIR;
      if (directory) {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'multi-line-journal.json'), JSON.stringify({ expected: { debitTotal: '2300.00', creditTotal: '2300.00', accounts: ['Receivables2300 debit', 'Revenue2000 credit', 'OutputGST300 credit'] }, actual: detail }, null, 2) + '\n');
      }
    } finally { await f.sql.end(); }
  }));
});
