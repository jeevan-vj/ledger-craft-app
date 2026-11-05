import { describe, expect, it, vi } from 'vitest';
import { purgeLedgerAccountData } from './account-purge';

describe('purgeLedgerAccountData', () => {
  it('deletes alarms, every paged organisation file, and all SQL/object storage in order', async () => {
    const order: string[] = [];
    const storage = {
      deleteAlarm: vi.fn(async () => { order.push('alarm'); }),
      deleteAll: vi.fn(async () => { order.push('storage'); }),
    };
    const list = vi.fn()
      .mockResolvedValueOnce({ objects: [{ key: 'org-1/imports/a.pdf' }], truncated: true, cursor: 'next' })
      .mockResolvedValueOnce({ objects: [{ key: 'org-1/invoices/b.pdf' }], truncated: false });
    const bucket = { list, delete: vi.fn(async (keys: string[]) => { order.push(`r2:${keys.join(',')}`); }) };

    await purgeLedgerAccountData(storage, bucket, 'org-1');

    expect(list).toHaveBeenNthCalledWith(1, { prefix: 'org-1/', cursor: undefined });
    expect(list).toHaveBeenNthCalledWith(2, { prefix: 'org-1/', cursor: 'next' });
    expect(order).toEqual(['alarm', 'r2:org-1/imports/a.pdf', 'r2:org-1/invoices/b.pdf', 'storage']);
  });
});
