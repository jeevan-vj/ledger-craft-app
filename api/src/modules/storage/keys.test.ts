import { describe, expect, it } from 'vitest';
import { decodeBase64Payload, maxBytesForKind } from './keys';

describe('SQLite attachment limits', () => {
  it('limits receipt and logo files to one megabyte', () => {
    expect(maxBytesForKind('receipt')).toBe(1024 * 1024);
    expect(maxBytesForKind('logo')).toBe(1024 * 1024);
  });
  it('rejects oversized base64 before allocating decoded bytes', () => {
    const oversized = 'A'.repeat(Math.ceil(1024 * 1024 / 3) * 4 + 4);
    expect(() => decodeBase64Payload(oversized)).toThrow('Files must be 1 MB or smaller');
    expect(decodeBase64Payload('aGVsbG8=')).toEqual(new TextEncoder().encode('hello'));
  });
});
