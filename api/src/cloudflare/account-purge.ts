type PurgeStorage = {
  deleteAlarm(): Promise<void>;
  deleteAll(): Promise<void>;
};

type PurgeBucket = {
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
  delete(keys: string[]): Promise<void>;
};

/** Prevents any alarm write from racing past the point where account purge deletes it. */
export class AccountPurgeGate {
  private purgeStarted = false;
  private readonly alarmWrites = new Set<Promise<void>>();

  get isPurged(): boolean {
    return this.purgeStarted;
  }

  get pendingAlarmWrites(): number {
    return this.alarmWrites.size;
  }

  async scheduleAlarm(write: () => Promise<void>): Promise<void> {
    if (this.purgeStarted) return;
    const pending = Promise.resolve().then(write);
    this.alarmWrites.add(pending);
    try {
      await pending;
    } finally {
      this.alarmWrites.delete(pending);
    }
  }

  async beginPurge(): Promise<void> {
    this.purgeStarted = true;
    await Promise.allSettled([...this.alarmWrites]);
  }
}

export async function runRecurringAlarm(
  gate: AccountPurgeGate,
  run: () => Promise<{ nextAlarmAt?: string | null }>,
  setAlarm: (timestamp: number) => Promise<void>,
): Promise<void> {
  if (gate.isPurged) return;
  const result = await run();
  if (!result.nextAlarmAt) return;
  await gate.scheduleAlarm(() => setAlarm(new Date(result.nextAlarmAt!).getTime()));
}

/** Stops generation first, removes every organisation R2 object, then drops all Ledger DO state. */
export async function purgeLedgerAccountData(
  storage: PurgeStorage,
  bucket: PurgeBucket | undefined,
  organisationId: string,
  gate = new AccountPurgeGate(),
): Promise<void> {
  await gate.beginPurge();
  await storage.deleteAlarm();
  if (bucket) await purgeBucketPrefix(bucket, `${organisationId}/`);
  await storage.deleteAll();
}

async function purgeBucketPrefix(bucket: PurgeBucket, prefix: string, cursor?: string): Promise<void> {
  const page = await bucket.list({ prefix, cursor });
  if (page.objects.length > 0) await bucket.delete(page.objects.map((object) => object.key));
  if (page.truncated && page.cursor) await purgeBucketPrefix(bucket, prefix, page.cursor);
}
