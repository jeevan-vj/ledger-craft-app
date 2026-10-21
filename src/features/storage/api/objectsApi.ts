import { presentResponseError } from '@/lib/apiErrorCopy';
import type { ObjectDto, ObjectKind, UploadObjectRequest } from '@ledgercraft/contracts';

export function storageApiEnabled(): boolean {
  return import.meta.env.VITE_STORAGE_API === 'true';
}

export class ObjectsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ObjectsApiError';
  }
}

async function parseError(response: Response): Promise<string> {
  return (await presentResponseError(response)).message;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) throw new ObjectsApiError(await parseError(response), response.status);
  return (await response.json()) as T;
}

export function objectKeyFromUrl(urlOrPath: string): string {
  try {
    const url = new URL(urlOrPath, window.location.origin);
    const key = url.searchParams.get('key');
    if (key) return key;
  } catch {
    // fall through
  }
  const marker = 'key=';
  const index = urlOrPath.indexOf(marker);
  if (index >= 0) return decodeURIComponent(urlOrPath.slice(index + marker.length).split('&')[0] ?? urlOrPath);
  return urlOrPath;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const objectsApi = {
  async upload(input: UploadObjectRequest): Promise<ObjectDto> {
    return request<ObjectDto>('/api/objects', { method: 'POST', body: JSON.stringify(input) });
  },

  async uploadFile(file: File, kind: ObjectKind): Promise<{ url: string; path: string } | null> {
    try {
      const dto = await this.upload({
        kind,
        filename: file.name || 'upload',
        contentType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      });
      return { url: dto.url, path: dto.key };
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  },

  async delete(urlOrPath: string): Promise<boolean> {
    try {
      const key = objectKeyFromUrl(urlOrPath);
      await request<void>(`/api/objects?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  },
};
