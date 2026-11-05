import { describe, expect, it, vi } from 'vitest';
import { AccountPurgeGate, purgeLedgerAccountData, runRecurringAlarm } from './account-purge';

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

  it('does not let an already-running alarm re-arm after account purge begins', async () => {
    let finishAlarm!: (result: { nextAlarmAt: string }) => void;
    const alarmResult = new Promise<{ nextAlarmAt: string }>((resolve) => { finishAlarm = resolve; });
    const alarmStarted = vi.fn();
    const setAlarm = vi.fn(async () => undefined);
    const storage = {
      deleteAlarm: vi.fn(async () => undefined),
      deleteAll: vi.fn(async () => undefined),
    };
    const gate = new AccountPurgeGate();

    const runningAlarm = runRecurringAlarm(gate, async () => {
      alarmStarted();
      return alarmResult;
    }, setAlarm);
    expect(alarmStarted).toHaveBeenCalledOnce();

    const purge = purgeLedgerAccountData(storage, undefined, 'org-1', gate);
    finishAlarm({ nextAlarmAt: '2026-11-07T00:00:00.000Z' });
    await Promise.all([runningAlarm, purge]);

    expect(storage.deleteAlarm).toHaveBeenCalledOnce();
    expect(storage.deleteAll).toHaveBeenCalledOnce();
    expect(setAlarm).not.toHaveBeenCalled();
  });

  it('waits for an alarm write already in flight before deleting the stored alarm', async () => {
    let finishWrite!: () => void;
    const writeFinished = new Promise<void>((resolve) => { finishWrite = resolve; });
    const order: string[] = [];
    const gate = new AccountPurgeGate();
    const storage = {
      deleteAlarm: vi.fn(async () => { order.push('delete-alarm'); }),
      deleteAll: vi.fn(async () => { order.push('delete-storage'); }),
    };

    const scheduling = gate.scheduleAlarm(async () => {
      await writeFinished;
      order.push('set-alarm');
    });
    await vi.waitFor(() => expect(gate.pendingAlarmWrites).toBe(1));
    const purge = purgeLedgerAccountData(storage, undefined, 'org-1', gate);
    expect(storage.deleteAlarm).not.toHaveBeenCalled();

    finishWrite();
    await Promise.all([scheduling, purge]);

    expect(order).toEqual(['set-alarm', 'delete-alarm', 'delete-storage']);
  });
});
