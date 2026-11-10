import { healthzResponseSchema, readyzResponseSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';

export function healthRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get('/healthz', (c) => {
    return c.json(response(c));
  });

  routes.get('/readyz', async (c) => {
    const check = c.get('checkDatabase');
    const ready = check ? await check() : true;
    if (!ready) {
      return c.json(readyzResponseSchema.parse({ status: 'not_ready' as const }), 503);
    }
    return c.json(readyzResponseSchema.parse({ status: 'ok' as const }));
  });

  routes.get('/api/healthz', (c) => {
    return c.json(response(c));
  });

  routes.get('/api/readyz', async (c) => {
    const check = c.get('checkDatabase');
    const ready = check ? await check() : true;
    if (!ready) {
      return c.json(readyzResponseSchema.parse({ status: 'not_ready' as const }), 503);
    }
    return c.json(readyzResponseSchema.parse({ status: 'ok' as const }));
  });

  return routes;
}
  const response = (c: { get: (key: 'capabilities') => AppEnv['Variables']['capabilities'] }) => {
    const current = c.get('capabilities') ?? { email: 'unavailable' as const, ai: 'unavailable' as const, stripe: 'unavailable' as const };
    return healthzResponseSchema.parse({
      status: 'ok' as const,
      capabilities: {
        email: current.email,
        ai: current.ai,
        stripe: current.stripe,
        assistant: current.assistant ?? 'unavailable',
      },
    });
  };
