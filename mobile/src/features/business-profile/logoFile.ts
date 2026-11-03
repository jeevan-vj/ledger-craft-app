import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { AuthApiError, OFFLINE_MESSAGE } from '@/features/auth/api/http';

/** Stay under the API's 1 MB object cap after base64 expansion. */
export const LOGO_UPLOAD_MAX_BYTES = 950_000;

export const LOGO_UPLOAD_FAILED = 'The logo could not be uploaded. Use a JPG, PNG, or WebP image under 1 MB.';
export const LOGO_TOO_LARGE = 'The logo is still too large after resizing. Choose a smaller image.';
export const LOGO_READ_FAILED = 'The logo could not be read. Try a different photo.';

export class LogoUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogoUploadError';
  }
}

export type PickedLogo = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
};

export type PreparedLogo = {
  filename: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  contentBase64: string;
};

type LogoType = {
  contentType: PreparedLogo['contentType'];
  extension: 'jpg' | 'png' | 'webp';
  format: ImageManipulator.SaveFormat;
};

const JPEG_PRESETS = [
  { maxDimension: 1024, compress: 0.82 },
  { maxDimension: 768, compress: 0.7 },
  { maxDimension: 512, compress: 0.58 },
] as const;

function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}

/** Mime type wins. The file name is only a fallback. The URI is not. */
export function logoFileType(mimeType?: string | null, fileName?: string | null): LogoType {
  const mime = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (mime === 'image/png' || (!mime && ext === 'png')) {
    return { contentType: 'image/png', extension: 'png', format: ImageManipulator.SaveFormat.PNG };
  }
  if (mime === 'image/webp' || (!mime && ext === 'webp')) {
    return { contentType: 'image/webp', extension: 'webp', format: ImageManipulator.SaveFormat.WEBP };
  }
  return { contentType: 'image/jpeg', extension: 'jpg', format: ImageManipulator.SaveFormat.JPEG };
}

export function logoFailureMessage(error: unknown): string {
  if (error instanceof LogoUploadError) return error.message;
  if (error instanceof AuthApiError) {
    if (error.status === 0) return OFFLINE_MESSAGE;
    if (error.code === 'FILE_TOO_LARGE' || /too large/i.test(error.message)) {
      return 'The logo is too large. Use an image under 1 MB.';
    }
    return LOGO_UPLOAD_FAILED;
  }
  return LOGO_UPLOAD_FAILED;
}

export async function prepareLogoFile(asset: PickedLogo): Promise<PreparedLogo> {
  if (!asset.uri?.trim()) throw new LogoUploadError(LOGO_READ_FAILED);
  const preferred = logoFileType(asset.mimeType, asset.fileName);
  const attempts = [
    ...(preferred.contentType === 'image/jpeg'
      ? []
      : [{ maxDimension: 1024, compress: 1, ...preferred }]),
    ...JPEG_PRESETS.map((preset) => ({
      ...preset,
      contentType: 'image/jpeg' as const,
      extension: 'jpg' as const,
      format: ImageManipulator.SaveFormat.JPEG,
    })),
  ];
  const width = asset.width && asset.width > 0 ? asset.width : 1024;
  const height = asset.height && asset.height > 0 ? asset.height : 1024;
  let sawOversized = false;

  for (const attempt of attempts) {
    try {
      const resize = width >= height
        ? { width: Math.min(width, attempt.maxDimension) }
        : { height: Math.min(height, attempt.maxDimension) };
      const result = await ImageManipulator.manipulateAsync(asset.uri, [{ resize }], {
        compress: attempt.compress,
        format: attempt.format,
        base64: false,
      });
      if (!result?.uri) continue;
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || !('size' in info) || !info.size) continue;
      if (info.size > LOGO_UPLOAD_MAX_BYTES) {
        sawOversized = true;
        continue;
      }
      const raw = await FileSystem.readAsStringAsync(result.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const contentBase64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
      if (!contentBase64) continue;
      if (decodedBase64Bytes(contentBase64) > LOGO_UPLOAD_MAX_BYTES) {
        sawOversized = true;
        continue;
      }
      return {
        filename: `logo.${attempt.extension}`,
        contentType: attempt.contentType,
        contentBase64,
      };
    } catch {
      continue;
    }
  }

  throw new LogoUploadError(sawOversized ? LOGO_TOO_LARGE : LOGO_READ_FAILED);
}
