import { readdir, readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Database } from '../db/client';
import { createDb } from '../db/local';
import { getDatabaseUrl } from '../env';

export const ORG_A = '11111111-1111-1111-1111-111111111111';
export const ORG_B = '22222222-2222-2222-2222-222222222222';
export const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export type AppTx = Database;

export async function withTestDb<T>(run: (ctx: {
  db: Database;
  asMigrator: Database;
  appSql: ReturnType<typeof createDb>['sql'];
}) => Promise<T>): Promise<T> {
  const url = getDatabaseUrl();
  if (!url.includes('ledgercraft-sqlite-test-') || !url.endsWith('/ledgercraft_test.sqlite')) {
    throw new Error('Refusing to reset a non-test SQLite database');
  }
  await unlink(fileURLToPath(url)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  const app = createDb(url);
  try {
    const directory = new URL('../../sqlite-migrations/', import.meta.url);
    const migrations = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    if (!migrations.length) throw new Error('No SQLite migrations found');
    for (const name of migrations) await app.sql.exec(await readFile(new URL(name, directory), 'utf8'));
    return await run({ db: app.db, asMigrator: app.db, appSql: app.sql });
  } finally {
    await app.sql.end();
  }
}

export async function assertLocalDatabaseReachable(): Promise<void> {
  const { sql } = createDb(getDatabaseUrl());
  try { await sql`SELECT 1`; } finally { await sql.end(); }
}
