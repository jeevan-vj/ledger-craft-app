import { isAllowedLogoUrl, LOGO_MAX_DECODED_BYTES } from '@ledgercraft/contracts';

const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const LOGO_FILE_MESSAGE = 'Use a PNG, JPEG, or WebP logo under 950 KB.';

export function logoChoiceError(file: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.has(file.type) || file.size <= 0 || file.size > LOGO_MAX_DECODED_BYTES) {
    return LOGO_FILE_MESSAGE;
  }
  return null;
}

export function logoDataUrlError(value: string): string | null {
  return isAllowedLogoUrl(value) ? null : LOGO_FILE_MESSAGE;
}
