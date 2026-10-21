import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { createApp } from '../app';
import { setErrorReporter, type ErrorReport } from '../observability/report';
import type { AppEnv } from '../types';
import { errorHandler } from './errors';

describe('errorHandler', () => {
  afterEach(() => setErrorReporter(() => {}));

  it('reports unexpected errors with the route template and request id', async () => {
    const reports: ErrorReport[] = [];
    setErrorReporter((_error, report) => {
      reports.push(report);
    });
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'req_handler');
      c.set('actorUserId', 'user_42');
      await next();
    });
    app.get('/api/invoices/:id', () => {
      throw new Error('ledger write failed');
    });
    app.onError(errorHandler);

    const response = await app.request('/api/invoices/11111111-1111-4111-8111-111111111111');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: 'req_handler',
      },
    });
    expect(reports).toEqual([
      {
        source: 'hono',
        requestId: 'req_handler',
        route: '/api/invoices/:id',
        userId: 'user_42',
      },
    ]);
  });

  it('does not report validation failures', async () => {
    const reports: ErrorReport[] = [];
    setErrorReporter((_error, report) => reports.push(report));
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'req_validation');
      await next();
    });
    app.get('/api/items', () => {
      throw new ZodError([]);
    });
    app.onError(errorHandler);
    const response = await app.request('/api/items');
    expect(response.status).toBe(400);
    expect(reports).toEqual([]);
  });

  it('logs a scrubbed stack for the test boom route', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await createApp().request('/api/__test/boom');
    expect(response.status).toBe(500);
    const logged = spy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('unhandled_error');
    expect(logged).toContain('password authentication failed');
    expect(logged).toContain('stack');
    spy.mockRestore();
  });
});
