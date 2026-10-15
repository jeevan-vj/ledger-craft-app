import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types';

export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header('x-request-id');
  const requestId = incoming && incoming.length > 0 ? incoming : `req_${crypto.randomUUID()}`;
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
});
