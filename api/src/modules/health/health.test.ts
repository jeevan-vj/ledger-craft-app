import { errorEnvelopeSchema, healthzResponseSchema, readyzResponseSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';

describe('health routes', () => {
  it('GET /healthz returns 200 without a database', async () => {
    const app = createApp({
      checkDatabase: async () => {
        throw new Error('db should not be called for healthz');
      },
    });

    const response = await app.request('/healthz');
    expect(response.status).toBe(200);
    expect(healthzResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      capabilities: { email: 'unavailable', ai: 'unavailable' },
    });
    expect(response.headers.get('x-request-id')).toMatch(/^req_/);
  });

  it('GET /api/healthz matches the Vite proxy path', async () => {
    const response = await createApp({
      capabilities: { email: 'available', ai: 'unavailable' },
    }).request('/api/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      capabilities: { email: 'available', ai: 'unavailable' },
    });
  });

  it('allows idempotent browser writes through CORS preflight', async () => {
    const response = await createApp().request('/api/invoice-imports', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:8080',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,idempotency-key',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('idempotency-key');
  });

  it('GET /readyz returns 200 when the database check passes', async () => {
    const app = createApp({ checkDatabase: async () => true });
    const response = await app.request('/readyz');
    expect(response.status).toBe(200);
    expect(readyzResponseSchema.parse(await response.json())).toEqual({ status: 'ok' });
  });

  it('GET /readyz returns 503 when the database is down', async () => {
    const app = createApp({ checkDatabase: async () => false });
    const response = await app.request('/readyz');
    expect(response.status).toBe(503);
    expect(readyzResponseSchema.parse(await response.json())).toEqual({ status: 'not_ready' });
  });

  it('unknown routes return the standard error envelope', async () => {
    const response = await createApp().request('/api/does-not-exist');
    expect(response.status).toBe(404);
    const body = errorEnvelopeSchema.parse(await response.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toMatch(/^req_/);
  });

  it('unexpected errors do not leak database messages', async () => {
    const response = await createApp().request('/api/__test/boom');
    expect(response.status).toBe(500);
    const body = errorEnvelopeSchema.parse(await response.json());
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(body)).not.toContain('password authentication');
  });
});
