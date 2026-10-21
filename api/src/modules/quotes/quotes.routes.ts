import { createErrorEnvelope } from '@ledgercraft/contracts';
import {
  createQuoteRequestSchema,
  createShareQuoteRequestSchema,
  quoteListQuerySchema,
  quoteStatusChangeSchema,
  respondToQuoteRequestSchema,
  sendQuoteRequestSchema,
  updateQuoteRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { apiError } from '../../http-error';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { hashIdempotencyPayload, parseIdempotencyKey } from '../invoices/idempotency';
import { createLoggingInvoiceMailer } from '../invoices/mailer';
import * as quotesConvert from './quotes.convert';
import * as quotesService from './quotes.service';
import { QuoteAlreadyRespondedError, respondToPublicQuote, getPublicSharedQuote, createShareForUser } from './quotes.share';

const fallbackMailer = createLoggingInvoiceMailer();
const RESPOND_BODY_LIMIT_BYTES = 4096;

function optionalQuery(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function readOptionalJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

async function readAtMost(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.byteLength > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // cancel() may already have released the reader.
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readRespondBody(request: Request): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared != null && declared.trim() !== '') {
    const length = Number(declared);
    if (Number.isFinite(length) && length > RESPOND_BODY_LIMIT_BYTES) {
      throw apiError(400, 'VALIDATION_ERROR', 'Response is too large');
    }
  }
  const bytes = await readAtMost(request.body, RESPOND_BODY_LIMIT_BYTES);
  if (!bytes) throw apiError(400, 'VALIDATION_ERROR', 'Response is too large');
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw apiError(400, 'VALIDATION_ERROR', 'Response must be JSON');
  }
  if (!raw.trim()) throw apiError(400, 'VALIDATION_ERROR', 'Enter the name of the person responding');
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw apiError(400, 'VALIDATION_ERROR', 'Response must be JSON');
  }
}

export function quoteRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/quotes/next-number`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await quotesService.peekNextQuoteNumber(db, user.id));
    });

    routes.get(`${prefix}/quotes`, async (c) => {
      const { db, user } = await requireSession(c);
      const query = quoteListQuerySchema.parse(Object.fromEntries(
        Object.entries({
          status: optionalQuery(c.req.query('status')),
          customerId: optionalQuery(c.req.query('customerId')),
          q: optionalQuery(c.req.query('q')),
          from: optionalQuery(c.req.query('from')),
          to: optionalQuery(c.req.query('to')),
        }).filter((entry) => entry[1] !== undefined),
      ));
      return c.json(await quotesService.listQuotesForUser(db, user.id, query));
    });

    routes.get(`${prefix}/public/quotes/:token`, async (c) => {
      const db = c.get('db');
      if (!db) throw new HTTPException(503, { message: 'Database unavailable' });
      return c.json(await getPublicSharedQuote(db, c.req.param('token')));
    });

    routes.post(`${prefix}/public/quotes/:token/respond`, async (c) => {
      const input = respondToQuoteRequestSchema.parse(await readRespondBody(c.req.raw));
      const db = c.get('db');
      if (!db) throw new HTTPException(503, { message: 'Database unavailable' });
      try {
        return c.json(await respondToPublicQuote(db, c.req.param('token'), input));
      } catch (error) {
        if (error instanceof QuoteAlreadyRespondedError) {
          return c.json({
            ...createErrorEnvelope('QUOTE_ALREADY_RESPONDED', error.message, c.get('requestId') ?? 'req_unknown'),
            response: error.response,
          }, 409);
        }
        throw error;
      }
    });

    routes.get(`${prefix}/quotes/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await quotesService.getQuoteForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/quotes`, async (c) => {
      const { db, user } = await requireSession(c);
      const body: unknown = await c.req.json();
      const input = createQuoteRequestSchema.parse(body);
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      const idempotency = key
        ? { key, method: 'POST', path: '/api/quotes', requestHash: hashIdempotencyPayload(body) }
        : undefined;
      return c.json(await quotesService.createQuoteForUser(db, user.id, input, idempotency), 201);
    });

    routes.patch(`${prefix}/quotes/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateQuoteRequestSchema.parse(await c.req.json());
      return c.json(await quotesService.updateQuoteForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/quotes/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await quotesService.deleteQuoteForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });

    routes.post(`${prefix}/quotes/:id/duplicate`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await quotesService.duplicateQuoteForUser(db, user.id, c.req.param('id')), 201);
    });

    routes.post(`${prefix}/quotes/:id/revise`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await quotesService.reviseQuoteForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/quotes/:id/mark-sent`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await quotesService.markQuoteSentForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/quotes/:id/send`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = sendQuoteRequestSchema.parse(await readOptionalJson(c));
      const mailer = c.get('invoiceMailer') ?? fallbackMailer;
      return c.json(await quotesService.sendQuoteForUser(db, user.id, c.req.param('id'), input, mailer));
    });

    routes.post(`${prefix}/quotes/:id/status`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = quoteStatusChangeSchema.parse(await c.req.json());
      return c.json(await quotesService.setQuoteStatusForUser(db, user.id, c.req.param('id'), input));
    });

    routes.post(`${prefix}/quotes/:id/share`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createShareQuoteRequestSchema.parse(await readOptionalJson(c));
      return c.json(await createShareForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.post(`${prefix}/quotes/:id/convert`, async (c) => {
      const { db, user } = await requireSession(c);
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      const idempotency = key
        ? {
            key,
            method: 'POST',
            path: `/api/quotes/${c.req.param('id')}/convert`,
            requestHash: hashIdempotencyPayload({}),
          }
        : undefined;
      return c.json(await quotesConvert.convertQuoteForUser(db, user.id, c.req.param('id'), idempotency));
    });
  }

  return routes;
}
