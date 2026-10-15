import {
  confirmReconciliationMatchesRequestSchema,
  createReconciliationAdjustmentRequestSchema,
  createReconciliationMatchRequestSchema,
  createReconciliationSessionRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as reconService from './reconciliation.service';

export function reconciliationRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/reconciliation-sessions`, async (c) => {
      const { db, user } = await requireSession(c);
      const bankAccountId = c.req.query('bankAccountId');
      return c.json(
        await reconService.listSessionsForUser(
          db,
          user.id,
          bankAccountId ? z.string().uuid().parse(bankAccountId) : undefined,
        ),
      );
    });

    routes.get(`${prefix}/reconciliation-sessions/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await reconService.getSessionForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/reconciliation-sessions`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createReconciliationSessionRequestSchema.parse(await c.req.json());
      return c.json(await reconService.createSessionForUser(db, user.id, input), 201);
    });

    routes.post(`${prefix}/reconciliation-sessions/:id/complete`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await reconService.completeSessionForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/reconciliation-sessions/:id/matches`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createReconciliationMatchRequestSchema.parse(await c.req.json());
      return c.json(await reconService.createMatchForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.post(`${prefix}/reconciliation-sessions/:id/matches/confirm`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = confirmReconciliationMatchesRequestSchema.parse(await c.req.json());
      return c.json(await reconService.confirmMatchesForUser(db, user.id, c.req.param('id'), input.matches));
    });

    routes.get(`${prefix}/reconciliation-sessions/:id/adjustments`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await reconService.listAdjustmentsForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/reconciliation-sessions/:id/adjustments`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createReconciliationAdjustmentRequestSchema.parse(await c.req.json());
      return c.json(await reconService.createAdjustmentForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.get(`${prefix}/book-entries`, async (c) => {
      const { db, user } = await requireSession(c);
      const from = z.string().min(1).parse(c.req.query('from'));
      const to = z.string().min(1).parse(c.req.query('to'));
      return c.json(await reconService.listBookEntriesForUser(db, user.id, from, to));
    });
  }

  return routes;
}
