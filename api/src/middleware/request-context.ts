import { createMiddleware } from 'hono/factory';
import { resolveRequestId } from '../observability/request-id';
import type { AppEnv } from '../types';

export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = resolveRequestId(c.req.header('x-request-id'));
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
});
