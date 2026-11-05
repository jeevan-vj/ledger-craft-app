import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ObjectStore, StoredObject } from './object-store';

function encodeKey(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64url');
}

export function createFilesystemObjectStore(rootDir?: string): ObjectStore {
  const root = resolve(rootDir ?? process.env.OBJECT_STORE_DIR ?? join(process.cwd(), '.data/objects'));

  function paths(key: string) {
    const encoded = encodeKey(key);
    return {
      data: join(root, encoded),
      meta: join(root, `${encoded}.json`),
    };
  }

  return {
    async put(object) {
      const { data, meta } = paths(object.key);
      await mkdir(dirname(data), { recursive: true });
      await writeFile(data, object.bytes);
      await writeFile(meta, JSON.stringify({ key: object.key, contentType: object.contentType }));
    },
    async get(key) {
      const { data, meta } = paths(key);
      try {
        const [bytes, raw] = await Promise.all([readFile(data), readFile(meta, 'utf8')]);
        const parsed = JSON.parse(raw) as { contentType: string };
        return { key, contentType: parsed.contentType, bytes: new Uint8Array(bytes) } satisfies StoredObject;
      } catch {
        return undefined;
      }
    },
    async delete(key) {
      const { data, meta } = paths(key);
      await Promise.allSettled([unlink(data), unlink(meta)]);
    },
    async purgePrefix(prefix) {
      const names = await readdir(root).catch(() => []);
      const keys = names.filter((name) => !name.endsWith('.json')).flatMap((name) => {
        try { return [Buffer.from(name, 'base64url').toString('utf8')]; } catch { return []; }
      }).filter((key) => key.startsWith(prefix));
      await Promise.all(keys.map(async (key) => {
        const target = paths(key);
        await Promise.allSettled([unlink(target.data), unlink(target.meta)]);
      }));
    },
  };
}
