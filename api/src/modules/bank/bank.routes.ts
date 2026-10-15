import {
  createBankAccountRequestSchema,
  importBankTransactionsRequestSchema,
  updateBankAccountRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as bankService from './bank.service';

export function bankRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/bank-accounts`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await bankService.listBankAccountsForUser(db, user.id));
    });

    routes.get(`${prefix}/bank-accounts/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await bankService.getBankAccountForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/bank-accounts`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createBankAccountRequestSchema.parse(await c.req.json());
      return c.json(await bankService.createBankAccountForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/bank-accounts/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateBankAccountRequestSchema.parse(await c.req.json());
      return c.json(await bankService.updateBankAccountForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/bank-accounts/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await bankService.deleteBankAccountForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });

    routes.get(`${prefix}/bank-transactions`, async (c) => {
      const { db, user } = await requireSession(c);
      const bankAccountId = c.req.query('bankAccountId');
      return c.json(
        await bankService.listBankTransactionsForUser(db, user.id, {
          bankAccountId: bankAccountId ? z.string().uuid().parse(bankAccountId) : undefined,
          from: c.req.query('from') ?? undefined,
          to: c.req.query('to') ?? undefined,
        }),
      );
    });

    routes.post(`${prefix}/bank-transactions/import`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = importBankTransactionsRequestSchema.parse(await c.req.json());
      return c.json(await bankService.importBankTransactionsForUser(db, user.id, input), 201);
    });
  }

  return routes;
}
