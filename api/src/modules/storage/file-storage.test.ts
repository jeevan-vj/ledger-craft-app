import { describe, expect, it } from 'vitest';
import { createMemoryFileStorage } from './file-storage';
import { createR2FileStorage, type R2BucketLike } from './r2-file-storage';

describe('FileStorage', () => {
  it('stores immutable bytes and exposes metadata through head', async () => {
    const storage = createMemoryFileStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put({
      key: 'org-1/imports/file.pdf',
      contentType: 'application/pdf',
      bytes,
      sha256: 'abc123',
    });
    bytes[0] = 9;

    await expect(storage.head('org-1/imports/file.pdf')).resolves.toEqual({
      key: 'org-1/imports/file.pdf',
      contentType: 'application/pdf',
      size: 3,
      sha256: 'abc123',
    });
    await expect(storage.get('org-1/imports/file.pdf')).resolves.toMatchObject({
      bytes: new Uint8Array([1, 2, 3]),
    });

    await storage.delete('org-1/imports/file.pdf');
    await expect(storage.head('org-1/imports/file.pdf')).resolves.toBeUndefined();
  });

  it('maps an R2 binding without requiring one to exist', async () => {
    const entries = new Map<string, { bytes: Uint8Array; contentType: string; sha256?: string }>();
    const bucket: R2BucketLike = {
      async put(key, value, options) {
        entries.set(key, {
          bytes: new Uint8Array(value),
          contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream',
          sha256: options?.customMetadata?.sha256,
        });
        return {};
      },
      async get(key) {
        const entry = entries.get(key);
        if (!entry) return null;
        return {
          size: entry.bytes.byteLength,
          httpMetadata: { contentType: entry.contentType },
          customMetadata: entry.sha256 ? { sha256: entry.sha256 } : undefined,
          async arrayBuffer() {
            return entry.bytes.slice().buffer;
          },
        };
      },
      async head(key) {
        const entry = entries.get(key);
        return entry ? {
          size: entry.bytes.byteLength,
          httpMetadata: { contentType: entry.contentType },
          customMetadata: entry.sha256 ? { sha256: entry.sha256 } : undefined,
        } : null;
      },
      async delete(key) {
        entries.delete(key);
      },
    };
    const storage = createR2FileStorage(bucket);

    await storage.put({
      key: 'org-1/imports/photo.jpg', contentType: 'image/jpeg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff]), sha256: 'feedface',
    });

    await expect(storage.head('org-1/imports/photo.jpg')).resolves.toMatchObject({
      contentType: 'image/jpeg', size: 3, sha256: 'feedface',
    });
    await expect(storage.get('org-1/imports/photo.jpg')).resolves.toMatchObject({
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
    });
  });
});
