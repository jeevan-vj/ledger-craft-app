import {
  createBankAccountRequestSchema,
  bankTransactionDetailsRequestSchema,
  bankTransactionListQuerySchema,
  bankTransactionSuggestionBatchRequestSchema,
  acceptBankTransactionSuggestionRequestSchema,
  createBankMatchingRuleRequestSchema,
  createBankTransactionRequestSchema,
  createBankTransferRequestSchema,
  duplicateBankTransactionRequestSchema,
  importBankTransactionsRequestSchema,
  updateBankAccountRequestSchema,
  updateBankTransactionRequestSchema,
  updateBankMatchingRuleRequestSchema,
  markBankTransactionPersonalRequestSchema,
  undoBankTransactionReconciliationRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as bankService from './bank.service';
import * as actionService from '../reconciliation/reconciliation-actions.service';
import * as ruleService from '../reconciliation/matching-rules.service';
import { hashIdempotencyPayload, parseIdempotencyKey } from '../invoices/idempotency';

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
      const input = bankTransactionListQuerySchema.parse({
        bankAccountId: c.req.query('bankAccountId') ?? undefined,
        from: c.req.query('from') ?? undefined,
        to: c.req.query('to') ?? undefined,
        status: c.req.query('status') ?? undefined,
        direction: c.req.query('direction') ?? undefined,
        search: c.req.query('search') ?? undefined,
        page: c.req.query('page') ?? undefined,
        pageSize: c.req.query('pageSize') ?? undefined,
      });
      return c.json(await bankService.listBankTransactionsForUser(db, user.id, input));
    });

    routes.get(`${prefix}/bank-transactions/export.csv`, async (c) => {
      const { db, user } = await requireSession(c);
      const bankAccountId = c.req.query('bankAccountId');
      const csv = await bankService.exportBankTransactionsCsvForUser(
        db,
        user.id,
        bankAccountId ? z.string().uuid().parse(bankAccountId) : undefined,
      );
      return c.body(csv, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bank-transactions.csv"',
      });
    });

    routes.get(`${prefix}/bank-transactions/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await bankService.getBankTransactionForUser(db, user.id, c.req.param('id')));
    });

    routes.get(`${prefix}/bank-transactions/:id/suggestions`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await bankService.getBankTransactionSuggestionsForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/bank-transactions/suggestions/batch`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = bankTransactionSuggestionBatchRequestSchema.parse(await c.req.json());
      return c.json(await bankService.getBankTransactionSuggestionsBatchForUser(db, user.id, input.transactionIds));
    });

    routes.post(`${prefix}/bank-transactions/:id/accept`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = acceptBankTransactionSuggestionRequestSchema.parse(await c.req.json());
      return c.json(await actionService.acceptSuggestionForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.post(`${prefix}/bank-transactions/:id/personal`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = markBankTransactionPersonalRequestSchema.parse(await c.req.json());
      return c.json(await actionService.markPersonalForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.post(`${prefix}/bank-transactions/:id/undo`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = undoBankTransactionReconciliationRequestSchema.parse(await c.req.json());
      return c.json(await actionService.undoReconciliationForUser(db, user.id, c.req.param('id'), input));
    });

    routes.post(`${prefix}/bank-transactions`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createBankTransactionRequestSchema.parse(await c.req.json());
      return c.json(await bankService.createBankTransactionForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/bank-transactions/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateBankTransactionRequestSchema.parse(await c.req.json());
      return c.json(await bankService.updateBankTransactionForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/bank-transactions/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await bankService.deleteBankTransactionForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });

    routes.put(`${prefix}/bank-transactions/:id/details`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = bankTransactionDetailsRequestSchema.parse(await c.req.json());
      return c.json(await bankService.saveBankTransactionDetailsForUser(db, user.id, c.req.param('id'), input));
    });

    routes.post(`${prefix}/bank-transactions/:id/duplicate`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = duplicateBankTransactionRequestSchema.parse(await c.req.json());
      return c.json(await bankService.duplicateBankTransactionForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.get(`${prefix}/bank-transfers/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await bankService.getBankTransferForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/bank-transfers`, async (c) => {
      const { db, user } = await requireSession(c);
      const body: unknown = await c.req.json();
      const input = createBankTransferRequestSchema.parse(body);
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      return c.json(await bankService.createBankTransferForUser(db, user.id, input, key ? {
        key,
        method: 'POST',
        path: '/api/bank-transfers',
        requestHash: hashIdempotencyPayload(body),
      } : undefined), 201);
    });

    routes.post(`${prefix}/bank-transactions/import`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = importBankTransactionsRequestSchema.parse(await c.req.json());
      return c.json(await bankService.importBankTransactionsForUser(db, user.id, input), 201);
    });

    routes.get(`${prefix}/bank-matching-rules`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await ruleService.listRulesForUser(db, user.id));
    });

    routes.post(`${prefix}/bank-matching-rules`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createBankMatchingRuleRequestSchema.parse(await c.req.json());
      return c.json(await ruleService.createRuleForUser(db, user.id, input), 201);
    });

    routes.patch(`${prefix}/bank-matching-rules/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateBankMatchingRuleRequestSchema.parse(await c.req.json());
      return c.json(await ruleService.updateRuleForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/bank-matching-rules/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await ruleService.deleteRuleForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }

  return routes;
}
