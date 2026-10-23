import { createExchangeRateRequestSchema, updateCurrencySettingsRequestSchema, upsertCurrencyRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as service from './currency.service';

export function currencyRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/currency-settings`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.getSettingsForUser(db, user.id));
    });
    routes.patch(`${prefix}/currency-settings`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.updateSettingsForUser(db, user.id, updateCurrencySettingsRequestSchema.parse(await c.req.json())));
    });
    routes.put(`${prefix}/currencies/:code`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = upsertCurrencyRequestSchema.parse({ ...(await c.req.json()), code: c.req.param('code').toUpperCase() });
      return c.json(await service.upsertCurrencyForUser(db, user.id, input));
    });
    routes.post(`${prefix}/exchange-rates`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.createRateForUser(db, user.id, createExchangeRateRequestSchema.parse(await c.req.json())), 201);
    });
    routes.delete(`${prefix}/exchange-rates/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await service.deleteRateForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }
  return routes;
}
