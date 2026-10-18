import {
  bulkItemRequestSchema,
  createItemCategoryRequestSchema,
  createItemRequestSchema,
  duplicateItemRequestSchema,
  importItemsRequestSchema,
  updateItemCategoryRequestSchema,
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

    routes.get(`${prefix}/items/export`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.text(await itemsService.exportItemsForUser(db, user.id), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="items.csv"',
      });
    });

    routes.post(`${prefix}/items/import`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = importItemsRequestSchema.parse(await c.req.json());
      return c.json(await itemsService.importItemsForUser(db, user.id, input));
    });

    routes.post(`${prefix}/items/bulk`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = bulkItemRequestSchema.parse(await c.req.json());
      return c.json(await itemsService.bulkItemsForUser(db, user.id, input));
    });

    routes.post(`${prefix}/items/:id/duplicate`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = duplicateItemRequestSchema.parse(await c.req.json());
      return c.json(await itemsService.duplicateItemForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.get(`${prefix}/items/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await itemsService.getItemForUser(db, user.id, c.req.param('id')));
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

    routes.patch(`${prefix}/item-categories/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateItemCategoryRequestSchema.parse(await c.req.json());
      return c.json(await itemsService.updateCategoryForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/item-categories/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await itemsService.deleteCategoryForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }

  return routes;
}
