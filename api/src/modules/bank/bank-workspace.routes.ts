import { Hono } from 'hono';
import { bankDefaultAccountSchema, bankMovementQuerySchema } from '@ledgercraft/contracts';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as service from './bank-workspace.service';
export function bankWorkspaceRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api']) {
    routes.get(`${prefix}/bank-default-account`, async c => { const { db, user } = await requireSession(c); return c.json(await service.getDefaultBankForUser(db, user.id)); });
    routes.put(`${prefix}/bank-default-account`, async c => { const { db, user } = await requireSession(c); const value = bankDefaultAccountSchema.parse(await c.req.json()); return c.json(await service.setDefaultBankForUser(db, user.id, value.bankAccountId)); });
    routes.get(`${prefix}/bank-accounts/:id/movements`, async c => { const { db, user } = await requireSession(c); const query = bankMovementQuerySchema.parse(c.req.query()); return c.json(await service.bankMovementsForUser(db, user.id, c.req.param('id'), query)); });
  }
  return routes;
}
