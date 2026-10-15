import {
  createCustomerRequestSchema,
  updateCustomerRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as customersService from './customers.service';

export function customerRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/customers`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await customersService.listCustomersForUser(db, user.id));
    });

    routes.get(`${prefix}/customers/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await customersService.getCustomerForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/customers`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createCustomerRequestSchema.parse(await c.req.json());
      return c.json(await customersService.createCustomerForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/customers/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateCustomerRequestSchema.parse(await c.req.json());
      return c.json(
        await customersService.updateCustomerForUser(db, user.id, c.req.param('id'), input),
      );
    });

    routes.delete(`${prefix}/customers/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await customersService.deleteCustomerForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }

  return routes;
}
