export type StoredObject = {
  key: string;
  contentType: string;
  bytes: Uint8Array;
};

export type ObjectStore = {
  put(object: StoredObject): Promise<void>;
  get(key: string): Promise<StoredObject | undefined>;
  delete(key: string): Promise<void>;
};

export function createMemoryObjectStore(): ObjectStore {
  const objects = new Map<string, StoredObject>();
  return {
    async put(object) {
      objects.set(object.key, { ...object, bytes: new Uint8Array(object.bytes) });
    },
    async get(key) {
      const found = objects.get(key);
      return found ? { ...found, bytes: new Uint8Array(found.bytes) } : undefined;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
