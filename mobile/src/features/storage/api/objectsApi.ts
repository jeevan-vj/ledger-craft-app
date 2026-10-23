import { apiRequest } from '@/features/auth/api/http';

export function storageApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_STORAGE_API === 'true';
}

interface ObjectDto {
  key: string;
  url: string;
  contentType: string;
  size: number;
  kind: 'receipt' | 'logo' | 'invoice';
}

export function objectKeyFromUrl(urlOrPath: string): string {
  const marker = 'key=';
  const index = urlOrPath.indexOf(marker);
  if (index >= 0) return decodeURIComponent(urlOrPath.slice(index + marker.length).split('&')[0] ?? urlOrPath);
  return urlOrPath;
}

export const objectsApi = {
  async upload(input: {
    kind: 'receipt' | 'logo' | 'invoice';
    filename: string;
    contentType: string;
    contentBase64: string;
  }): Promise<ObjectDto> {
    return apiRequest<ObjectDto>('/api/objects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async delete(urlOrPath: string): Promise<boolean> {
    try {
      const key = objectKeyFromUrl(urlOrPath);
      await apiRequest<void>(`/api/objects?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  },
};
