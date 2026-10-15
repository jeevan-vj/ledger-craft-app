import { describe, expect, it } from 'vitest';
import { uploadObjectRequestSchema } from './object';

describe('object contracts', () => {
  it('rejects ownership ids on upload', () => {
    expect(
      uploadObjectRequestSchema.safeParse({
        kind: 'receipt',
        filename: 'receipt.png',
        contentType: 'image/png',
        contentBase64: 'abc',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });
});
