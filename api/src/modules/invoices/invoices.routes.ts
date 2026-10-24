import {
  createInvoiceRequestSchema,
  createInvoiceAttachmentRequestSchema,
  createShareInvoiceRequestSchema,
  importInvoicesRequestSchema,
  invoiceLifecycleActionRequestSchema,
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
import * as lifecycleService from './invoice-lifecycle.service';
import { createLoggingInvoiceMailer } from './mailer';
import * as shareService from './share';
import { createFilesystemObjectStore } from '../storage/filesystem';

const fallbackMailer = createLoggingInvoiceMailer();
const fallbackObjectStore = createFilesystemObjectStore();

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

    routes.get(`${prefix}/invoices-export.csv`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.text(await lifecycleService.exportInvoicesForUser(db, user.id), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="invoices.csv"',
      });
    });

    routes.post(`${prefix}/invoices-import`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await lifecycleService.importInvoicesForUser(db, user.id, importInvoicesRequestSchema.parse(await c.req.json())));
    });

    routes.get(`${prefix}/public/invoices/:token`, async (c) => {
      const db = c.get('db');
      if (!db) throw new HTTPException(503, { message: 'Database unavailable' });
      return c.json(await shareService.getPublicSharedInvoice(db, c.req.param('token')));
    });

    routes.get(`${prefix}/public/invoices/:token/attachments/:attachmentId`, async (c) => {
      const db = c.get('db');
      if (!db) throw new HTTPException(503, { message: 'Database unavailable' });
      const attachment = await shareService.getPublicSharedAttachment(db, c.req.param('token'), c.req.param('attachmentId'));
      const object = await (c.get('objectStore') ?? fallbackObjectStore).get(attachment.objectKey);
      if (!object) throw new HTTPException(404, { message: 'Attachment not found' });
      return new Response(Buffer.from(object.bytes), { headers: {
        'Content-Type': object.contentType, 'Content-Length': String(object.bytes.byteLength),
        'Content-Disposition': `inline; filename="${attachment.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      } });
    });

    routes.get(`${prefix}/invoices/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await invoicesService.getInvoiceForUser(db, user.id, c.req.param('id')));
    });

    routes.get(`${prefix}/invoices/:id/print`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await invoicesService.getInvoiceForUser(db, user.id, c.req.param('id')));
    });

    routes.get(`${prefix}/invoices/:id/history`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await lifecycleService.listHistoryForUser(db, user.id, c.req.param('id')));
    });

    routes.get(`${prefix}/invoices/:id/attachments`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await lifecycleService.listAttachmentsForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/invoices/:id/attachments`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createInvoiceAttachmentRequestSchema.parse(await c.req.json());
      return c.json(await lifecycleService.attachInvoiceFileForUser(db, user.id, c.req.param('id'), c.get('objectStore') ?? fallbackObjectStore, input), 201);
    });

    routes.delete(`${prefix}/invoices/:id/attachments/:attachmentId`, async (c) => {
      const { db, user } = await requireSession(c);
      await lifecycleService.deleteInvoiceAttachmentForUser(db, user.id, c.req.param('id'), c.req.param('attachmentId'), c.get('objectStore') ?? fallbackObjectStore);
      return c.body(null, 204);
    });

    routes.post(`${prefix}/invoices/:id/duplicate`, async (c) => {
      const { db, user } = await requireSession(c);
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      const path = `/api/invoices/${c.req.param('id')}/duplicate`;
      return c.json(await lifecycleService.duplicateInvoiceForUser(db, user.id, c.req.param('id'), key ? {
        key, method: 'POST', path, requestHash: hashIdempotencyPayload({ invoiceId: c.req.param('id') }),
      } : undefined), 201);
    });

    routes.post(`${prefix}/invoices/:id/cancel`, async (c) => {
      const { db, user } = await requireSession(c);
      let body: unknown = {}; try { body = await c.req.json(); } catch { body = {}; }
      return c.json(await lifecycleService.cancelInvoiceForUser(db, user.id, c.req.param('id'), invoiceLifecycleActionRequestSchema.parse(body)));
    });

    routes.post(`${prefix}/invoices/:id/restore`, async (c) => {
      const { db, user } = await requireSession(c);
      let body: unknown = {}; try { body = await c.req.json(); } catch { body = {}; }
      return c.json(await lifecycleService.restoreInvoiceForUser(db, user.id, c.req.param('id'), invoiceLifecycleActionRequestSchema.parse(body)));
    });

    routes.delete(`${prefix}/invoices/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await lifecycleService.archiveInvoiceForUser(db, user.id, c.req.param('id'), {}));
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

    routes.get(`${prefix}/invoices/:id/shares`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await shareService.listSharesForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/invoices/:id/shares/revoke`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await shareService.revokeSharesForUser(db, user.id, c.req.param('id')));
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
      const result = await shareService.createShareForUser(db, user.id, c.req.param('id'), input);
      return c.json(result.share, result.created ? 201 : 200);
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
