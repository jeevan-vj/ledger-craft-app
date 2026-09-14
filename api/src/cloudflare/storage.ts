import { createDatabase, type SQLiteAdapter } from '../db/client';
import type { ObjectStore } from '../modules/storage/object-store';
import { migrations } from '../../../deploy/api/migrations.generated';

export async function migrateStorage(storage: DurableObjectStorage) {
  const bookmark = await storage.getCurrentBookmark();
  storage.transactionSync(() => {
    storage.sql.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)');
    storage.sql.exec('CREATE TABLE IF NOT EXISTS _migration_recovery (name TEXT PRIMARY KEY, bookmark TEXT NOT NULL)');
    for (const migration of migrations) {
      const applied = storage.sql.exec<{checksum: string}>('SELECT checksum FROM _migrations WHERE name = ?', migration.name).toArray()[0];
      if (applied && applied.checksum !== migration.checksum) throw new Error('Applied migration was modified: ' + migration.name);
      if (applied) continue;
      storage.sql.exec('INSERT INTO _migration_recovery VALUES (?, ?)', migration.name, bookmark);
      storage.sql.exec(migration.sql);
      storage.sql.exec('INSERT INTO _migrations VALUES (?, ?, ?)', migration.name, migration.checksum, Date.now());
    }
    storage.sql.exec('CREATE TABLE IF NOT EXISTS _objects (key TEXT PRIMARY KEY, content_type TEXT NOT NULL, bytes BLOB NOT NULL CHECK(length(bytes) <= 1048576))');
  });
}

export function durableDatabase(storage: DurableObjectStorage) {
  const adapter: SQLiteAdapter = {
    async query(sql, params, method) {
      const rows = Array.from(storage.sql.exec(sql, ...params).raw());
      return { rows: method === 'get' ? rows[0] : rows };
    },
    async execute<T>(sql: string, params: unknown[]) {
      return storage.sql.exec(sql, ...params).toArray() as T[];
    },
    transaction: (callback) => storage.transaction(callback),
  };
  return createDatabase(adapter);
}

export function durableObjectStore(storage: DurableObjectStorage): ObjectStore {
  return {
    async put(object) {
      if (object.bytes.byteLength > 1048576) throw new Error('Attachment exceeds 1 MB');
      storage.sql.exec('INSERT INTO _objects (key, content_type, bytes) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET content_type=excluded.content_type, bytes=excluded.bytes', object.key, object.contentType, object.bytes);
    },
    async get(key) {
      const row = storage.sql.exec<{content_type: string; bytes: ArrayBuffer}>('SELECT content_type, bytes FROM _objects WHERE key=?', key).toArray()[0];
      return row ? { key, contentType: row.content_type, bytes: new Uint8Array(row.bytes) } : undefined;
    },
    async delete(key) { storage.sql.exec('DELETE FROM _objects WHERE key=?', key); },
  };
}
