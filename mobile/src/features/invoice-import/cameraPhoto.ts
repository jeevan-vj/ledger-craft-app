import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

export const CAMERA_UPLOAD_MAX_BYTES = 950_000;
export const CAMERA_CAPTURE_QUALITY = 0.82;

const CAMERA_PRESETS = [
  { maxDimension: 1800, compress: CAMERA_CAPTURE_QUALITY },
  { maxDimension: 1600, compress: 0.72 },
  { maxDimension: 1400, compress: 0.62 },
  { maxDimension: 1200, compress: 0.52 },
] as const;

const READ_ERROR = 'The photo could not be read. Try again.';
const TOO_LARGE_ERROR = 'The photo is still too large after resizing. Move closer to the document and try again.';

type CameraAsset = {
  uri: string;
  fileName?: string | null;
  width: number;
  height: number;
};

type Manipulate = typeof ImageManipulator.manipulateAsync;

function decodedBase64Bytes(value: string): number {
  const raw = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(raw.length * 3 / 4) - padding);
}

function jpegFilename(fileName?: string | null): string {
  if (!fileName?.trim()) return `invoice-${Date.now()}.jpg`;
  const stem = fileName.replace(/\.[^.]+$/, '').trim() || 'invoice';
  return `${stem}.jpg`;
}

export async function prepareCameraPhoto(
  asset: CameraAsset,
  manipulate: Manipulate = ImageManipulator.manipulateAsync,
) {
  const landscape = asset.width >= asset.height;
  let sawOversized = false;
  for (const preset of CAMERA_PRESETS) {
    const resize = landscape
      ? { width: Math.min(asset.width, preset.maxDimension) }
      : { height: Math.min(asset.height, preset.maxDimension) };
    const result = await manipulate(asset.uri, [{ resize }], {
      base64: false,
      compress: preset.compress,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    if (!result?.uri) throw new Error(READ_ERROR);
    const info = await FileSystem.getInfoAsync(result.uri);
    if (!info.exists || info.size <= 0) throw new Error(READ_ERROR);
    if (info.size > CAMERA_UPLOAD_MAX_BYTES) {
      sawOversized = true;
      continue;
    }
    const contentBase64 = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!contentBase64) throw new Error(READ_ERROR);
    const sizeBytes = decodedBase64Bytes(contentBase64);
    if (sizeBytes > CAMERA_UPLOAD_MAX_BYTES) {
      sawOversized = true;
      continue;
    }
    return {
      uri: result.uri,
      filename: jpegFilename(asset.fileName),
      contentType: 'image/jpeg' as const,
      contentBase64,
      sizeBytes,
    };
  }
  throw new Error(sawOversized ? TOO_LARGE_ERROR : READ_ERROR);
}
