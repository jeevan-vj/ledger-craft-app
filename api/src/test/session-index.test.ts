import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { withTestDb } from './harness';

it('indexes session lookups by user without changing existing session columns', async () => {
  await withTestDb(async ({ asMigrator }) => {
    const columns = await asMigrator.execute<{name:string}>(sql`PRAGMA index_info('sessions_user_id_idx')`);
    expect(columns.map(column => column.name)).toEqual(['user_id']);
  });
});
