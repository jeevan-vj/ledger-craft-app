import { Hono, type Context } from 'hono';
import type { AppEnv } from '../../types';
import { getMe } from './get-me';
import { requireSession } from './require-session';

async function handleMe(c: Context<AppEnv>) {
  const { db, user } = await requireSession(c);
  return c.json(await getMe(db, user));
}

export function sessionRoutes() {
  const routes = new Hono<AppEnv>();
  routes.get('/me', handleMe);
  routes.get('/api/me', handleMe);
  return routes;
}
