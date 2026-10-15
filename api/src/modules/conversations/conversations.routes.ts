import {
  addConversationMessageRequestSchema,
  createConversationRequestSchema,
  updateConversationRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as conversationsService from './conversations.service';

export function conversationRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/conversations`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await conversationsService.listConversationsForUser(db, user.id));
    });

    routes.get(`${prefix}/conversations/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await conversationsService.getConversationForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/conversations`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createConversationRequestSchema.parse(await c.req.json());
      return c.json(await conversationsService.createConversationForUser(db, user.id, input), 201);
    });

    routes.post(`${prefix}/conversations/:id/messages`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = addConversationMessageRequestSchema.parse(await c.req.json());
      return c.json(await conversationsService.addMessageForUser(db, user.id, c.req.param('id'), input));
    });

    routes.patch(`${prefix}/conversations/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateConversationRequestSchema.parse(await c.req.json());
      return c.json(await conversationsService.updateConversationForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/conversations/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await conversationsService.deleteConversationForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }

  return routes;
}
