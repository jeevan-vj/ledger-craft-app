import { describe, expect, it } from 'vitest';
import { healthzResponseSchema, readyzResponseSchema } from './health';

describe('health contracts', () => {
  it('accepts healthz ok', () => {
    expect(healthzResponseSchema.parse({
      status: 'ok',
      capabilities: { email: 'available', ai: 'unavailable', stripe: 'available' },
    })).toEqual({
      status: 'ok',
      capabilities: { email: 'available', ai: 'unavailable', stripe: 'available' },
    });
  });

  it('never carries provider names in healthz capabilities', () => {
    expect(healthzResponseSchema.parse({
      status: 'ok',
      capabilities: { email: 'unavailable', ai: 'available', stripe: 'unavailable', aiProvider: 'workers-ai', stripeProvider: 'stripe' },
    }).capabilities).toEqual({ email: 'unavailable', ai: 'available', stripe: 'unavailable' });
  });

  it('accepts readyz ok and not_ready', () => {
    expect(readyzResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(readyzResponseSchema.parse({ status: 'not_ready' })).toEqual({
      status: 'not_ready',
    });
  });

  it('keeps assistant availability separate from generic ai', () => {
    expect(healthzResponseSchema.parse({
      status: 'ok',
      capabilities: { email: 'unavailable', ai: 'available', stripe: 'unavailable', assistant: 'available' },
    }).capabilities).toEqual({
      email: 'unavailable', ai: 'available', stripe: 'unavailable', assistant: 'available',
    });
  });

  it('rejects unknown readiness status', () => {
    expect(readyzResponseSchema.safeParse({ status: 'degraded' }).success).toBe(false);
  });
});
