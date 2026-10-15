import {
  createTaxReturnRequestSchema,
  fileTaxReturnRequestSchema,
  updateTaxReturnRequestSchema,
  upsertTaxConfigurationRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as taxService from './tax.service';

export function taxRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/tax-configurations`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await taxService.getTaxConfigurationForUser(db, user.id, c.req.query('countryCode') ?? 'NZ'));
    });

    routes.put(`${prefix}/tax-configurations`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = upsertTaxConfigurationRequestSchema.parse(await c.req.json());
      return c.json(await taxService.upsertTaxConfigurationForUser(db, user.id, input));
    });

    routes.get(`${prefix}/tax-returns`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await taxService.listTaxReturnsForUser(db, user.id));
    });

    routes.get(`${prefix}/tax-returns/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await taxService.getTaxReturnForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/tax-returns`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createTaxReturnRequestSchema.parse(await c.req.json());
      return c.json(await taxService.createTaxReturnForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/tax-returns/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateTaxReturnRequestSchema.parse(await c.req.json());
      return c.json(await taxService.updateTaxReturnForUser(db, user.id, c.req.param('id'), input));
    });

    routes.post(`${prefix}/tax-returns/:id/file`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = fileTaxReturnRequestSchema.parse(await c.req.json());
      return c.json(await taxService.fileTaxReturnForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/tax-returns/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await taxService.deleteTaxReturnForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }

  return routes;
}
