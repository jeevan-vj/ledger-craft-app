import { createJournalEntryRequestSchema, updateJournalEntryRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as journalsService from './journals.service';

export function journalRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/journal-entries`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await journalsService.listJournalEntriesForUser(db, user.id));
    });

    routes.post(`${prefix}/journal-entries`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createJournalEntryRequestSchema.parse(await c.req.json());
      return c.json(await journalsService.createJournalEntryForUser(db, user.id, input), 201);
    });

    routes.get(`${prefix}/journal-entries/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await journalsService.getJournalEntryForUser(db, user.id, c.req.param('id')));
    });

    routes.patch(`${prefix}/journal-entries/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateJournalEntryRequestSchema.parse(await c.req.json());
      return c.json(await journalsService.updateJournalEntryForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/journal-entries/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await journalsService.deleteJournalEntryForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }

  return routes;
}
