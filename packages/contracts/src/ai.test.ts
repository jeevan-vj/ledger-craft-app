import { describe, expect, it } from 'vitest';
import { chatCompletionRequestSchema, scanReceiptRequestSchema } from './ai';

describe('ai contracts', () => {
  it('rejects ownership ids on receipt scan', () => {
    expect(
      scanReceiptRequestSchema.safeParse({
        imageBase64: 'abc',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('rejects ownership ids on chat completion', () => {
    expect(
      chatCompletionRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'Hello' }],
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });
});
