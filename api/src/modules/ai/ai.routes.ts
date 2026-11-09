import { assistantTurnRequestSchema, chatCompletionRequestSchema, saveAssistantDraftRequestSchema, scanReceiptRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { hashIdempotencyPayload, parseIdempotencyKey } from '../invoices/idempotency';
import { createWorkersAiAssistantModel } from './assistant.workers';
import * as assistantService from './assistant.service';
import * as chatService from './chat';
import * as aiService from './scanner';

export function aiRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.post(`${prefix}/ai/receipt-scan`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = scanReceiptRequestSchema.parse(await c.req.json());
      const result = await aiService.scanReceiptForUser(db, user.id, c.get('receiptScanner'), input);
      // Compatibility output only: old installed clients format these fields as numbers.
      // Canonical proposals and all reviewed persistence retain decimal strings.
      return c.json(input.exactAmounts ? result : { ...result, total: result.total === null ? null : Number(result.total), tax: result.tax === null ? null : Number(result.tax), subtotal: result.subtotal === null ? null : Number(result.subtotal), items: result.items.map(item => ({...item, quantity:Number(item.quantity),price:Number(item.price)})) });
    });

    routes.post(`${prefix}/ai/chat`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = chatCompletionRequestSchema.parse(await c.req.json());
      return c.json(await chatService.completeChatForUser(db, user.id, c.get('chatCompleter'), input));
    });

    routes.post(`${prefix}/ai/assistant`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = assistantTurnRequestSchema.parse(await c.req.json());
      const configured = c.get('assistant');
      const workersAi = c.get('workersAi');
      const model = configured?.model ?? (workersAi ? createWorkersAiAssistantModel(workersAi) : undefined);
      return c.json(await assistantService.completeAssistantForUser(
        db, user.id, input, { ...configured, model }, c.get('capabilities'), c.get('requestId'),
      ));
    });

    routes.post(`${prefix}/ai/assistant/drafts`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = saveAssistantDraftRequestSchema.parse(await c.req.json());
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      const idempotency = key ? { key, method: 'POST', path: '/api/ai/assistant/drafts', requestHash: hashIdempotencyPayload(input) } : undefined;
      return c.json(await assistantService.saveAssistantDraftForUser(
        db, user.id, input, c.get('capabilities'), idempotency, c.get('requestId'),
      ), 201);
    });
  }

  return routes;
}
