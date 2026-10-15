import { createPaymentReceiptRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as receiptsService from './receipts.service';

export function receiptRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/receipts`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await receiptsService.listReceiptsForUser(db, user.id));
    });

    routes.get(`${prefix}/receipts/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await receiptsService.getReceiptForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/receipts`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createPaymentReceiptRequestSchema.parse(await c.req.json());
      return c.json(await receiptsService.createReceiptForUser(db, user.id, input), 201);
    });
  }

  return routes;
}
