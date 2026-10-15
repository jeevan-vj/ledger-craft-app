import { describe, expect, it } from 'vitest';
import { createErrorEnvelope, errorEnvelopeSchema } from './error';

describe('errorEnvelopeSchema', () => {
  it('accepts the standard API error envelope', () => {
    const payload = {
      error: {
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice could not be found',
        requestId: 'req_test_1',
      },
    };

    expect(errorEnvelopeSchema.parse(payload)).toEqual(payload);
  });

  it('rejects missing requestId', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects raw provider or database payloads', () => {
    const result = errorEnvelopeSchema.safeParse({
      message: 'password authentication failed for user "postgres"',
      code: '28P01',
    });

    expect(result.success).toBe(false);
  });

  it('createErrorEnvelope returns a parsed envelope', () => {
    expect(createErrorEnvelope('NOT_FOUND', 'Not found', 'req_abc')).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
        requestId: 'req_abc',
      },
    });
  });
});
