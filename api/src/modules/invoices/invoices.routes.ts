import {
  createInvoiceRequestSchema,
  createShareInvoiceRequestSchema,
  remindInvoiceRequestSchema,
  sendInvoiceRequestSchema,
  updateInvoiceRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { hashIdempotencyPayload, parseIdempotencyKey } from './idempotency';
import * as invoicesService from './invoices.service';
import { createLoggingInvoiceMailer } from './mailer';
import * as shareService from './share';

const fallbackMailer = createLoggingInvoiceMailer();

export function invoiceRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/invoices/next-number`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await invoicesService.peekNextInvoiceNumber(db, user.id));
    });

    routes.get(`${prefix}/invoices`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await invoicesService.listInvoicesForUser(db, user.id));
    });

    routes.get(`${prefix}/public/invoices/:token`, async (c) => {
      const db = c.get('db');
      if (!db) throw new HTTPException(503, { message: 'Database unavailable' });
      return c.json(await shareService.getPublicSharedInvoice(db, c.req.param('token')));
    });

    routes.get(`${prefix}/invoices/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await invoicesService.getInvoiceForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/invoices`, async (c) => {
      const { db, user } = await requireSession(c);
      const body: unknown = await c.req.json();
      const input = createInvoiceRequestSchema.parse(body);
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      const idempotency = key
        ? {
            key,
            method: 'POST',
            path: '/api/invoices',
            requestHash: hashIdempotencyPayload(body),
          }
        : undefined;
      return c.json(await invoicesService.createInvoiceForUser(db, user.id, input, idempotency), 201);
    });

    routes.post(`${prefix}/invoices/:id/share`, async (c) => {
      const { db, user } = await requireSession(c);
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      const input = createShareInvoiceRequestSchema.parse(body ?? {});
      return c.json(await shareService.createShareForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.post(`${prefix}/invoices/:id/send`, async (c) => {
      const { db, user } = await requireSession(c);
      let body: unknown = {};
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }
      const input = sendInvoiceRequestSchema.parse(body ?? {});
      const mailer = c.get('invoiceMailer') ?? fallbackMailer;
      return c.json(await invoicesService.sendInvoiceForUser(db, user.id, c.req.param('id'), input, mailer));
    });

    routes.post(`${prefix}/invoices/:id/remind`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = remindInvoiceRequestSchema.parse(await c.req.json());
      const mailer = c.get('invoiceMailer') ?? fallbackMailer;
      return c.json(await invoicesService.remindInvoiceForUser(db, user.id, c.req.param('id'), input, mailer));
    });

    routes.patch(`${prefix}/invoices/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateInvoiceRequestSchema.parse(await c.req.json());
      return c.json(await invoicesService.updateInvoiceForUser(db, user.id, c.req.param('id'), input));
    });
  }

  return routes;
}
