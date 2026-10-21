import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportUnhandledError, setErrorReporter } from './report';

const orgId = '11111111-1111-4111-8111-111111111111';
const shareToken = '22222222-2222-4222-8222-222222222222';

describe('reportUnhandledError', () => {
  afterEach(() => {
    setErrorReporter(() => {});
    vi.restoreAllMocks();
  });

  it('logs the scrubbed message and stack and forwards the report', () => {
    const error = new Error(
      `failed /api/public/invoices/${orgId}_${shareToken}?token=secret Bearer abc.def password=hunter2`,
    );
    error.stack = `${error.message}\n    at handler (/api/public/invoices/${orgId}_${shareToken}:1:1)`;
    const reports: unknown[] = [];
    setErrorReporter((caught, report) => {
      reports.push({ caught, report });
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    reportUnhandledError(error, {
      source: 'hono',
      requestId: 'req_log',
      route: '/api/public/invoices/:token',
      userId: 'user_1',
    });

    expect(reports).toEqual([
      {
        caught: error,
        report: {
          source: 'hono',
          requestId: 'req_log',
          route: '/api/public/invoices/:token',
          userId: 'user_1',
        },
      },
    ]);
    const logged = String(spy.mock.calls[0]?.[0]);
    const payload = JSON.parse(logged) as {
      msg: string;
      errorMessage: string;
      stack: string;
      requestId: string;
      route: string;
    };
    expect(payload.msg).toBe('unhandled_error');
    expect(payload.requestId).toBe('req_log');
    expect(payload.route).toBe('/api/public/invoices/:token');
    expect(payload.errorMessage.length).toBeGreaterThan(0);
    expect(payload.stack).toContain('at handler');
    expect(logged).not.toContain(shareToken);
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('abc.def');
    expect(logged).not.toContain('hunter2');
  });

  it('still returns when the reporter throws', () => {
    setErrorReporter(() => {
      throw new Error('sink down');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => reportUnhandledError(new Error('boom'), { source: 'worker', requestId: 'req_1', route: '/api/healthz' })).not.toThrow();
    expect(String(spy.mock.calls[1]?.[0])).toContain('error_report_failed');
  });
});
