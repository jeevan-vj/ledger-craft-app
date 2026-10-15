import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir = new URL('../api/sqlite-migrations/', import.meta.url);
const files = readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
if (!files.length) throw new Error('No SQLite migrations found');
const imports = files.map((f,i)=>`import sql${i} from '../../api/sqlite-migrations/${f}';`);
const entries = files.map((f,i)=>`{name:${JSON.stringify(f)},checksum:${JSON.stringify(createHash('sha256').update(readFileSync(new URL(f, dir))).digest('hex'))},sql:sql${i}}`);
writeFileSync(new URL('../deploy/api/migrations.generated.ts',import.meta.url), imports.join('\n')+'\nexport const migrations = ['+entries.join(',')+'];\n');
