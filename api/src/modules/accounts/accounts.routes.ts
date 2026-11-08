import {
  createAccountRequestSchema,
  prepareBankLedgerRequestSchema,
  initializeAccountsRequestSchema,
  updateAccountRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { hashIdempotencyPayload, parseIdempotencyKey } from '../invoices/idempotency';
import * as accountsService from './accounts.service';

export function accountRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/accounts`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await accountsService.listAccountsForUser(db, user.id));
    });

    routes.post(`${prefix}/accounts/bank-ledger`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await accountsService.prepareBankLedgerForUser(db, user.id, prepareBankLedgerRequestSchema.parse(await c.req.json()), c.req.header('X-Expected-Organisation-ID')));
    });

    routes.post(`${prefix}/accounts/initialize`, async (c) => {
      const { db, user } = await requireSession(c);
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      const input = initializeAccountsRequestSchema.parse(body ?? {});
      return c.json(await accountsService.initializeAccountsForUser(db, user.id, input));
    });

    routes.post(`${prefix}/accounts`, async (c) => {
      const { db, user } = await requireSession(c);
      const body: unknown = await c.req.json();
      const input = createAccountRequestSchema.parse(body);
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      const idempotency = key ? { key, method: 'POST', path: '/api/accounts', requestHash: hashIdempotencyPayload(body) } : undefined;
      return c.json(await accountsService.createAccountForUser(db, user.id, input, c.req.header('X-Expected-Organisation-ID'), idempotency), 201);
    });

    routes.patch(`${prefix}/accounts/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateAccountRequestSchema.parse(await c.req.json());
      return c.json(await accountsService.updateAccountForUser(db, user.id, c.req.param('id'), input));
    });
  }

  return routes;
}
