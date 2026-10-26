export type FileStoragePut = {
  key: string;
  contentType: string;
  bytes: Uint8Array;
  sha256?: string;
};

export type FileStorageHead = {
  key: string;
  contentType: string;
  size: number;
  sha256?: string;
};

export type StoredFile = FileStorageHead & {
  bytes: Uint8Array;
};

/** Provider-neutral private file storage used by invoice imports. */
export interface FileStorage {
  /** Default per-file cap for this adapter; route config may lower or explicitly raise it. */
  readonly maxBytes: number;
  put(file: FileStoragePut): Promise<void>;
  get(key: string): Promise<StoredFile | undefined>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<FileStorageHead | undefined>;
}

export function createMemoryFileStorage(): FileStorage {
  const files = new Map<string, StoredFile>();
  return {
    maxBytes: 1_048_576,
    async put(file) {
      files.set(file.key, {
        key: file.key,
        contentType: file.contentType,
        size: file.bytes.byteLength,
        sha256: file.sha256,
        bytes: new Uint8Array(file.bytes),
      });
    },
    async get(key) {
      const file = files.get(key);
      return file ? { ...file, bytes: new Uint8Array(file.bytes) } : undefined;
    },
    async delete(key) {
      files.delete(key);
    },
    async head(key) {
      const file = files.get(key);
      if (!file) return undefined;
      const { bytes: _bytes, ...head } = file;
      return head;
    },
  };
}
