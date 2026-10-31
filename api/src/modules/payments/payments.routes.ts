import { createPaymentRequestSchema, reversePaymentRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { hashIdempotencyPayload, parseIdempotencyKey } from '../invoices/idempotency';
import * as paymentsService from './payments.service';

export function paymentRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/payments`, async (c) => {
      const { db, user } = await requireSession(c);
      const invoiceId = c.req.query('invoiceId');
      const parsed = invoiceId ? z.string().uuid().parse(invoiceId) : undefined;
      return c.json(await paymentsService.listPaymentsForUser(db, user.id, parsed));
    });

    routes.get(`${prefix}/payments/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await paymentsService.getPaymentForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/payments`, async (c) => {
      const { db, user } = await requireSession(c);
      const body: unknown = await c.req.json();
      const input = createPaymentRequestSchema.parse(body);
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      const idempotency = key
        ? {
            key,
            method: 'POST',
            path: '/api/payments',
            requestHash: hashIdempotencyPayload(body),
          }
        : undefined;
      return c.json(await paymentsService.createPaymentForUser(db, user.id, input, idempotency), 201);
    });

    routes.post(`${prefix}/payments/:id/reverse`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = reversePaymentRequestSchema.parse(await c.req.json());
      return c.json(await paymentsService.reversePaymentForUser(db, user.id, c.req.param('id'), input));
    });
  }

  return routes;
}
