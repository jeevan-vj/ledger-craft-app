import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { COMPATIBILITY_COLUMNS } from '../db/schema/compatibility-inventory';
import { withTestDb } from './harness';

describe('SQLite compatibility schema', () => {
  it('creates every table and column the clients select', async () => {
    await withTestDb(async ({ db }) => {
      for (const [table, columns] of Object.entries(COMPATIBILITY_COLUMNS)) {
        const rows = await db.execute<{ name: string }>(sql.raw(`PRAGMA table_info("${table}")`));
        const present = new Set(rows.map((row) => row.name));
        expect(present.size, `missing table ${table}`).toBeGreaterThan(0);
        for (const column of columns) expect(present.has(column), `${table}.${column}`).toBe(true);
      }
    });
  });

  it('stores monetary columns as exact decimal text, not floating point', async () => {
    await withTestDb(async ({ db }) => {
      const rows = await db.execute<{ name: string; type: string }>(sql`PRAGMA table_info(invoices)`);
      const money = rows.filter((row) => ['subtotal', 'tax_amount', 'total', 'total_paid', 'balance_due'].includes(row.name));
      expect(money).toHaveLength(5);
      for (const row of money) expect(row.type.toUpperCase(), row.name).toBe('TEXT');
      const exact = await db.execute<{ value: string }>(sql`SELECT CAST('123456789012345.6789' AS TEXT) AS value`);
      expect(exact[0].value).toBe('123456789012345.6789');
    });
  });
});
