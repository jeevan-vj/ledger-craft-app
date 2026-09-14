import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { IDENTITY_COLUMNS } from '../db/schema/identity-inventory';
import { users, sessions } from '../db/schema/identity';
import { withTestDb } from './harness';

describe('SQLite identity schema', () => {
  it('creates organisations, memberships, and Better Auth tables', async () => {
    await withTestDb(async ({ db }) => {
      for (const [table, columns] of Object.entries(IDENTITY_COLUMNS)) {
        const rows = await db.execute<{ name: string }>(sql.raw(`PRAGMA table_info("${table}")`));
        const present = new Set(rows.map((row) => row.name));
        for (const column of columns) expect(present.has(column), `${table}.${column}`).toBe(true);
      }
    });
  });

  it('keeps Better Auth accounts separate from the chart of accounts', async () => {
    await withTestDb(async ({ db }) => {
      const auth = await db.execute<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_accounts'`);
      expect(auth).toHaveLength(1);
      const columns = await db.execute<{ name: string }>(sql`PRAGMA table_info(accounts)`);
      const names = new Set(columns.map((row) => row.name));
      expect(names.has('organisation_id')).toBe(true);
      expect(names.has('provider_id')).toBe(false);
      expect(names.has('account_id')).toBe(false);
    });
  });

  it('enforces unique user emails and cascades deleted user sessions', async () => {
    await withTestDb(async ({ db }) => {
      const [user] = await db.insert(users).values({ name: 'Owner', email: 'owner@example.com' }).returning();
      await expect(db.insert(users).values({ name: 'Duplicate', email: user.email })).rejects.toThrow();
      await db.insert(sessions).values({ userId: user.id, token: 'unique-token', expiresAt: new Date(Date.now() + 60000) });
      await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);
      expect(await db.select().from(sessions)).toHaveLength(0);
    });
  });
});
