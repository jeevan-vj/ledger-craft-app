import type { FileStorage } from './file-storage';

type R2MetadataLike = {
  size: number;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

type R2ObjectBodyLike = R2MetadataLike & { arrayBuffer(): Promise<ArrayBuffer> };

/** Minimal structural type keeps the adapter testable without a live Cloudflare binding. */
export interface R2BucketLike {
  put(
    key: string,
    value: Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
      sha256?: string;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2MetadataLike | null>;
  delete(key: string): Promise<void>;
}

function metadata(key: string, object: R2MetadataLike) {
  const sha256 = object.customMetadata?.sha256;
  return {
    key,
    contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    size: object.size,
    ...(sha256 ? { sha256 } : {}),
  };
}

export function createR2FileStorage(bucket: R2BucketLike): FileStorage {
  return {
    maxBytes: 10 * 1_048_576,
    async put(file) {
      await bucket.put(file.key, file.bytes, {
        httpMetadata: { contentType: file.contentType },
        customMetadata: file.sha256 ? { sha256: file.sha256 } : undefined,
        sha256: file.sha256,
      });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return undefined;
      return {
        ...metadata(key, object),
        bytes: new Uint8Array(await object.arrayBuffer()),
      };
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async head(key) {
      const object = await bucket.head(key);
      return object ? metadata(key, object) : undefined;
    },
  };
}
