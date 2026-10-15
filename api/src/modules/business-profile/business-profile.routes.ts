import { upsertBusinessProfileRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as businessProfileService from './business-profile.service';

export function businessProfileRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/business-profile`, async (c) => {
      const { db, user } = await requireSession(c);
      const profile = await businessProfileService.getBusinessProfileForUser(db, user.id);
      if (!profile) {
        throw new HTTPException(404, { message: 'Business profile not found' });
      }
      return c.json(profile);
    });

    routes.put(`${prefix}/business-profile`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = upsertBusinessProfileRequestSchema.parse(await c.req.json());
      return c.json(await businessProfileService.upsertBusinessProfileForUser(db, user.id, input));
    });
  }

  return routes;
}
