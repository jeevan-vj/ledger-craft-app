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
  if (bucket) await purgeBucketPrefix(bucket, `${organisationId}/`);
  await storage.deleteAll();
}

async function purgeBucketPrefix(bucket: PurgeBucket, prefix: string, cursor?: string): Promise<void> {
  const page = await bucket.list({ prefix, cursor });
  if (page.objects.length > 0) await bucket.delete(page.objects.map((object) => object.key));
  if (page.truncated && page.cursor) await purgeBucketPrefix(bucket, prefix, page.cursor);
}
