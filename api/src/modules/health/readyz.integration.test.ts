import { readyzResponseSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';

describe('readyz against SQLite', () => {
  it('returns 200 when the SQLite connection responds', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async ({ appSql }) => {
      const app = createApp({
        checkDatabase: async () => {
          await appSql`SELECT 1`;
          return true;
        },
      });
      const response = await app.request('/api/readyz');
      expect(response.status).toBe(200);
      expect(readyzResponseSchema.parse(await response.json())).toEqual({ status: 'ok' });
    });
  });
});
