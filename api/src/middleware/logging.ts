import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

export const requestLogging = createMiddleware<AppEnv>(async (c, next) => {
  const started = Date.now();
  await next();
  const payload = {
    msg: 'http_request',
    requestId: c.get('requestId'),
    route: c.req.path,
    method: c.req.method,
    status: c.res.status,
    durationMs: Date.now() - started,
  };
  console.log(JSON.stringify(payload));
});
