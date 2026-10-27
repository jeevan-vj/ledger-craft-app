import { createSaleRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { apiError } from '../../http-error';
import { requireSession } from '../auth/require-session';
import { hashIdempotencyPayload, parseIdempotencyKey } from '../invoices/idempotency';
import * as salesService from './sales.service';

export function saleRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.post(`${prefix}/sales`, async (c) => {
      const { db, user } = await requireSession(c);
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      if (!key) throw apiError(400, 'VALIDATION_ERROR', 'Idempotency-Key is required');
      const body: unknown = await c.req.json();
      const input = createSaleRequestSchema.parse(body);
      return c.json(await salesService.createSaleForUser(db, user.id, input, {
        key,
        method: 'POST',
        path: '/api/sales',
        requestHash: hashIdempotencyPayload(body),
      }), 201);
    });
  }

  return routes;
}
