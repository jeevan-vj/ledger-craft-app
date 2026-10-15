import {
  createItemCategoryRequestSchema,
  createItemRequestSchema,
  updateItemRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as itemsService from './items.service';

export function itemRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/items`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await itemsService.listCatalogForUser(db, user.id));
    });

    routes.post(`${prefix}/items`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createItemRequestSchema.parse(await c.req.json());
      return c.json(await itemsService.createItemForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/items/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateItemRequestSchema.parse(await c.req.json());
      return c.json(await itemsService.updateItemForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/items/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await itemsService.deleteItemForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });

    routes.post(`${prefix}/item-categories`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createItemCategoryRequestSchema.parse(await c.req.json());
      return c.json(await itemsService.createCategoryForUser(db, user.id, input), 201);
    });
  }

  return routes;
}
