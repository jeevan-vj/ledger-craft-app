import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './client';

// Node 24+ SQLite metadata/array APIs; workspace Node typings predate them.
type SQLInputValue = null | number | bigint | string | Uint8Array;
type CurrentStatement = StatementSync & { columns(): unknown[]; setReturnArrays(enabled: boolean): void };

interface Connection {
  sqlite: DatabaseSync;
  context: AsyncLocalStorage<boolean>;
  tail: Promise<unknown>;
  references: number;
  savepoint: number;
}
const connections = new Map<string, Connection>();

function filename(url: string): string {
  if (url === ':memory:') return url;
  if (url.startsWith('file:')) return fileURLToPath(url);
  if (url.includes('://')) throw new Error('Local database must be a SQLite filename or file URL');
  return resolve(url);
}

function bind(values: unknown[]): SQLInputValue[] {
  return values.map((value) => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === undefined) return null;
    return value as SQLInputValue;
  });
}

export function createDb(url: string) {
  const path = filename(url);
  let connection = connections.get(path);
  if (!connection) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const sqlite = new DatabaseSync(path);
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    connection = { sqlite, context: new AsyncLocalStorage(), tail: Promise.resolve(), references: 0, savepoint: 0 };
    connections.set(path, connection);
  }
  const state = connection;
  state.references++;
  let closed = false;
  const locked = async <T>(callback: () => Promise<T> | T): Promise<T> => {
    if (closed) throw new Error('Database handle is closed');
    if (state.context.getStore()) return callback();
    const operation = state.tail.then(() => state.context.run(true, callback));
    state.tail = operation.catch(() => undefined);
    return operation;
  };
  const execute = <T>(query: string, params: unknown[] = []): Promise<T[]> => locked(() => {
    const statement = state.sqlite.prepare(query) as CurrentStatement;
    if (statement.columns().length) return statement.all(...bind(params)) as T[];
    statement.run(...bind(params));
    return [];
  });
  const db = createDatabase({
    execute,
    query: (query, params, method) => locked(() => {
      const statement = state.sqlite.prepare(query) as CurrentStatement;
      statement.setReturnArrays(true);
      if (method === 'run') {
        statement.run(...bind(params));
        return { rows: [] };
      }
      if (method === 'get') return { rows: (statement.get(...bind(params)) ?? []) as any[] };
      return { rows: statement.all(...bind(params)) as any[] };
    }),
    transaction: (callback) => locked(async () => {
      const savepoint = `ledgercraft_${++state.savepoint}`;
      state.sqlite.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = await callback();
        state.sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        state.sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    }),
  });
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...params: unknown[]) => execute<Record<string, unknown>>(strings.join('?'), params),
    {
      unsafe: (query: string, params: unknown[] = []) => execute<Record<string, unknown>>(query, params),
      exec: (query: string) => locked(() => state.sqlite.exec(query)),
      end: async (_options?: { timeout?: number }) => {
        if (closed) return;
        await state.tail;
        closed = true;
        if (--state.references === 0) {
          state.sqlite.close();
          connections.delete(path);
        }
      },
    },
  );
  return { db, sql };
}

export function createAppDb() {
  return createDb(process.env.DATABASE_URL ?? 'file:' + resolve('.data/ledgercraft.sqlite'));
}
