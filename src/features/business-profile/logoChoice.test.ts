import { describe, expect, it } from 'vitest';
import { LOGO_MAX_DECODED_BYTES } from '@ledgercraft/contracts';
import { LOGO_FILE_MESSAGE, logoChoiceError, logoDataUrlError } from './logoChoice';

describe('web logo choice', () => {
  it('accepts a small PNG, JPEG, or WebP and rejects other files', () => {
    expect(logoChoiceError({ type: 'image/png', size: 120 })).toBeNull();
    expect(logoChoiceError({ type: 'image/jpeg', size: 120 })).toBeNull();
    expect(logoChoiceError({ type: 'image/webp', size: 120 })).toBeNull();
    expect(logoChoiceError({ type: 'image/gif', size: 120 })).toBe(LOGO_FILE_MESSAGE);
    expect(logoChoiceError({ type: 'image/svg+xml', size: 120 })).toBe(LOGO_FILE_MESSAGE);
    expect(logoChoiceError({ type: 'image/png', size: LOGO_MAX_DECODED_BYTES + 1 })).toBe(LOGO_FILE_MESSAGE);
    expect(logoChoiceError({ type: 'image/png', size: 0 })).toBe(LOGO_FILE_MESSAGE);
  });

  it('accepts a safe data URL and rejects a non-image data URL', () => {
    expect(logoDataUrlError('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
    expect(logoDataUrlError('data:image/jpg;base64,iVBORw0KGgo=')).toBe(LOGO_FILE_MESSAGE);
    expect(logoDataUrlError('javascript:alert(1)')).toBe(LOGO_FILE_MESSAGE);
  });
});