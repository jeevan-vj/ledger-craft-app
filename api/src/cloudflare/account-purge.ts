type PurgeStorage = {
  deleteAlarm(): Promise<void>;
  deleteAll(): Promise<void>;
};

type PurgeBucket = {
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
  delete(keys: string[]): Promise<void>;
};

/** Stops generation first, removes every organisation R2 object, then drops all Ledger DO state. */
export async function purgeLedgerAccountData(storage: PurgeStorage, bucket: PurgeBucket | undefined, organisationId: string): Promise<void> {
  await storage.deleteAlarm();
  if (bucket) {
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix: `${organisationId}/`, cursor });
      if (page.objects.length > 0) await bucket.delete(page.objects.map((object) => object.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  await storage.deleteAll();
}
