import { createCreditNoteRequestSchema, refundCreditNoteRequestSchema, reverseCreditNoteRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { hashIdempotencyPayload, parseIdempotencyKey, type IdempotencyScope } from '../invoices/idempotency';
import * as service from './credit-notes.service';
import * as refunds from './credit-note-refunds.service';

function scope(key: string | undefined, path: string, input: unknown): IdempotencyScope {
  const parsed = parseIdempotencyKey(key);
  if (!parsed) throw new HTTPException(400, { message: 'Idempotency-Key is required for credit notes and refunds' });
  return { key: parsed, method: 'POST', path, requestHash: hashIdempotencyPayload(input) };
}
export function creditNoteRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/credit-notes`, async c => { const { db, user } = await requireSession(c); return c.json(await service.listCreditNotesForUser(db, user.id, c.req.query('invoiceId'))); });
    routes.get(`${prefix}/credit-notes/:id`, async c => { const { db, user } = await requireSession(c); return c.json(await service.creditNoteForUser(db, user.id, c.req.param('id'))); });
    routes.post(`${prefix}/credit-notes`, async c => { const { db, user } = await requireSession(c); const input = createCreditNoteRequestSchema.parse(await c.req.json()); return c.json(await service.issueCreditNoteForUser(db, user.id, input, scope(c.req.header('Idempotency-Key'), '/api/credit-notes', input)), 201); });
    routes.post(`${prefix}/credit-notes/:id/reverse`, async c => { const { db, user } = await requireSession(c); const input = reverseCreditNoteRequestSchema.parse(await c.req.json()); return c.json(await service.reverseCreditNoteForUser(db, user.id, c.req.param('id'), input)); });
    routes.post(`${prefix}/credit-notes/:id/refunds`, async c => { const { db, user } = await requireSession(c); const input = refundCreditNoteRequestSchema.parse(await c.req.json()); const id = c.req.param('id'); return c.json(await refunds.refundCreditNoteForUser(db, user.id, id, input, scope(c.req.header('Idempotency-Key'), `/api/credit-notes/${id}/refunds`, input)), 201); });
    routes.post(`${prefix}/credit-notes/:id/refunds/:refundId/reverse`, async c => { const { db, user } = await requireSession(c); const input = reverseCreditNoteRequestSchema.parse(await c.req.json()); return c.json(await refunds.reverseCreditNoteRefundForUser(db, user.id, c.req.param('id'), c.req.param('refundId'), input)); });
  }
  return routes;
}
