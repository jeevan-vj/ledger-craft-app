import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { executableMigrationSql } from './migration-sql';

describe('Durable Object migration SQL', () => {
 it('removes Drizzle breakpoint metadata including trailing comment-only segments without changing the immutable source', () => {
  const source='CREATE TABLE sample(id TEXT);--> statement-breakpoint\n\n';
  expect(executableMigrationSql(source)).toBe('CREATE TABLE sample(id TEXT);');
  expect(source).toContain('--> statement-breakpoint');
 });
 it('executes the complete generated migration sequence and preserves foreign-key integrity', () => {
  const db=new DatabaseSync(':memory:');
  try {
   db.exec('PRAGMA foreign_keys=ON');
   const directory=new URL('../../sqlite-migrations/',import.meta.url);
   for(const filename of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) {
    const executable=executableMigrationSql(readFileSync(new URL(filename,directory),'utf8'));
    expect(executable).not.toContain('--> statement-breakpoint');
    db.exec(executable);
   }
   expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
   expect(db.prepare('PRAGMA foreign_key_list(accounting_period_events)').all()).toHaveLength(1);
  } finally {db.close();}
 });
});
