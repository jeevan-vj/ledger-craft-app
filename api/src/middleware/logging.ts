import { createMiddleware } from 'hono/factory';
import { routePath } from 'hono/route';
import { routeTemplateFrom } from '../observability/scrub';
import type { AppEnv } from '../types';

export const requestLogging = createMiddleware<AppEnv>(async (c, next) => {
  const started = Date.now();
  await next();
  let pattern: string | undefined;
  try {
    pattern = routePath(c);
  } catch {
    pattern = undefined;
  }
  const payload = {
    msg: 'http_request',
    requestId: c.get('requestId'),
    route: routeTemplateFrom(pattern, c.req.path),
    method: c.req.method,
    status: c.res.status,
    durationMs: Date.now() - started,
  };
  console.log(JSON.stringify(payload));
});
