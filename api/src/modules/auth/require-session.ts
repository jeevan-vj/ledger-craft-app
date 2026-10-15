import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import type { AppEnv } from '../../types';

export async function requireSession(c: Context<AppEnv>) {
  const auth = c.get('auth');
  const db = c.get('db');
  if (!auth) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }
  if (!db) {
    throw new HTTPException(503, { message: 'Database unavailable' });
  }

  return { db, user: session.user };
}

export type SessionUser = { id: string; email: string; name: string };
export type DbHandle = Database;
