import {
  createAccountRequestSchema,
  initializeAccountsRequestSchema,
  updateAccountRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as accountsService from './accounts.service';

export function accountRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/accounts`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await accountsService.listAccountsForUser(db, user.id));
    });

    routes.post(`${prefix}/accounts/initialize`, async (c) => {
      const { db, user } = await requireSession(c);
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      const input = initializeAccountsRequestSchema.parse(body ?? {});
      return c.json(await accountsService.initializeAccountsForUser(db, user.id, input));
    });

    routes.post(`${prefix}/accounts`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createAccountRequestSchema.parse(await c.req.json());
      return c.json(await accountsService.createAccountForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/accounts/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateAccountRequestSchema.parse(await c.req.json());
      return c.json(await accountsService.updateAccountForUser(db, user.id, c.req.param('id'), input));
    });
  }

  return routes;
}
