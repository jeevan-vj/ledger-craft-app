import {
  acceptInvitationRequestSchema, createInvitationRequestSchema, createOrganisationRequestSchema,
  updateMemberRequestSchema, updateOrganisationRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as service from './organisations.service';

export function organisationRoutes() {
  const routes = new Hono<AppEnv>();
  routes.get('/api/organisations', async (c) => { const { db, user } = await requireSession(c); return c.json(await service.list(db, user.id)); });
  routes.post('/api/organisations', async (c) => { const { db, user } = await requireSession(c); return c.json(await service.create(db, user.id, createOrganisationRequestSchema.parse(await c.req.json())), 201); });
  routes.patch('/api/organisations/:id', async (c) => { const { db, user } = await requireSession(c); return c.json(await service.update(db, user.id, c.req.param('id'), updateOrganisationRequestSchema.parse(await c.req.json()))); });
  routes.post('/api/organisations/:id/switch', async (c) => { const { db, user } = await requireSession(c); return c.json(await service.switchActive(db, user.id, c.req.param('id'))); });
  routes.post('/api/organisations/:id/archive', async (c) => { const { db, user } = await requireSession(c); await service.archive(db, user.id, c.req.param('id')); return c.body(null, 204); });
  routes.get('/api/organisations/:id/members', async (c) => { const { db, user } = await requireSession(c); return c.json(await service.members(db, user.id, c.req.param('id'))); });
  routes.patch('/api/organisations/:id/members/:memberId', async (c) => { const { db, user } = await requireSession(c); await service.updateMember(db, user.id, c.req.param('id'), c.req.param('memberId'), updateMemberRequestSchema.parse(await c.req.json())); return c.body(null, 204); });
  routes.delete('/api/organisations/:id/members/:memberId', async (c) => { const { db, user } = await requireSession(c); await service.removeMember(db, user.id, c.req.param('id'), c.req.param('memberId')); return c.body(null, 204); });
  routes.get('/api/organisations/:id/invitations', async (c) => { const { db, user } = await requireSession(c); return c.json(await service.invitations(db, user.id, c.req.param('id'))); });
  routes.post('/api/organisations/:id/invitations', async (c) => { const { db, user } = await requireSession(c); return c.json(await service.invite(db, user.id, c.req.param('id'), createInvitationRequestSchema.parse(await c.req.json())), 201); });
  routes.post('/api/organisations/:id/invitations/:invitationId/resend', async (c) => { const { db, user } = await requireSession(c); return c.json(await service.resend(db, user.id, c.req.param('id'), c.req.param('invitationId'))); });
  routes.delete('/api/organisations/:id/invitations/:invitationId', async (c) => { const { db, user } = await requireSession(c); await service.revoke(db, user.id, c.req.param('id'), c.req.param('invitationId')); return c.body(null, 204); });
  routes.post('/api/invitations/accept', async (c) => { const { db, user } = await requireSession(c); const input = acceptInvitationRequestSchema.parse(await c.req.json()); return c.json(await service.accept(db, user, input.token)); });
  return routes;
}
