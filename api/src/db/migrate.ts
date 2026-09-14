import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDb} from './local';
import {getDatabaseUrl} from '../env';

const folder = new URL('../../sqlite-migrations/', import.meta.url);
export async function applyMigrations(): Promise<void> {
  const {db, sql} = createDb(getDatabaseUrl());
  try {
    await db.transaction(async () => {
      await sql.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)');
      for (const name of readdirSync(folder).filter(f=>f.endsWith('.sql')).sort()) {
        const source=readFileSync(new URL(name, folder),'utf8');
        const checksum=createHash('sha256').update(source).digest('hex');
        const [applied]=await sql`SELECT checksum FROM _migrations WHERE name=${name}`;
        if (applied && applied.checksum!==checksum) throw new Error(`Applied migration was modified: ${name}`);
        if (applied) continue;
        await sql.exec(source);
        await sql`INSERT INTO _migrations VALUES (${name}, ${checksum}, ${Date.now()})`;
      }
    });
  } finally {await sql.end();}
}
if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  applyMigrations().then(()=>console.log('SQLite migrations applied')).catch(error=>{console.error(error);process.exitCode=1;});
}
