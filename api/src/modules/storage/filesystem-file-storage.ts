import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { FileStorage, FileStorageHead } from './file-storage';

function encodeKey(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64url');
}

export function createFilesystemFileStorage(rootDir?: string): FileStorage {
  const root = resolve(rootDir ?? process.env.OBJECT_STORE_DIR ?? join(process.cwd(), '.data/objects'));
  const paths = (key: string) => {
    const encoded = encodeKey(`invoice-import:${key}`);
    return { data: join(root, encoded), meta: join(root, `${encoded}.json`) };
  };
  async function head(key: string): Promise<FileStorageHead | undefined> {
    const pathsForKey = paths(key);
    try {
      const [info, raw] = await Promise.all([stat(pathsForKey.data), readFile(pathsForKey.meta, 'utf8')]);
      const meta = JSON.parse(raw) as { contentType: string; sha256?: string };
      return { key, contentType: meta.contentType, size: info.size, sha256: meta.sha256 };
    } catch {
      return undefined;
    }
  }
  return {
    maxBytes: 1_048_576,
    async put(file) {
      const destination = paths(file.key);
      await mkdir(dirname(destination.data), { recursive: true });
      await writeFile(destination.data, file.bytes);
      await writeFile(destination.meta, JSON.stringify({ contentType: file.contentType, sha256: file.sha256 }));
    },
    async get(key) {
      const [info, bytes] = await Promise.all([head(key), readFile(paths(key).data).catch(() => undefined)]);
      return info && bytes ? { ...info, bytes: new Uint8Array(bytes) } : undefined;
    },
    async delete(key) {
      const destination = paths(key);
      await Promise.allSettled([unlink(destination.data), unlink(destination.meta)]);
    },
    head,
  };
}
