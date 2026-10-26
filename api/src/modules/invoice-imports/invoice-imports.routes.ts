import { createInvoiceImportRequestSchema, invoiceImportCommitRequestSchema, invoiceImportDraftPatchSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { createFilesystemFileStorage } from '../storage/filesystem-file-storage';
import type { FileStorage } from '../storage/file-storage';
import * as service from './invoice-imports.service';
import * as reviewService from './invoice-import-review.service';
import { createExtractionProvider } from './extraction';

const fallbackStorage = createFilesystemFileStorage();

function requireFileStorage(c: { get: (key: 'fileStorage') => FileStorage | undefined }): FileStorage {
  return c.get('fileStorage') ?? fallbackStorage;
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"`;
}

function requireExtractor(c: { get: (key: 'invoiceImportExtractor') => ReturnType<typeof createExtractionProvider> | undefined }) {
  return c.get('invoiceImportExtractor') ?? createExtractionProvider();
}

export function invoiceImportRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.post(`${prefix}/invoice-imports`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createInvoiceImportRequestSchema.parse(await c.req.json());
      return c.json(await service.createInvoiceImportForUser(db, user.id, requireFileStorage(c), input), 201);
    });

    routes.get(`${prefix}/invoice-imports`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.listInvoiceImportsForUser(db, user.id));
    });

    routes.post(`${prefix}/invoice-imports/:id/extract`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await reviewService.extractInvoiceImportForUser(
        db, user.id, requireFileStorage(c), requireExtractor(c), c.req.param('id'),
      ));
    });

    routes.get(`${prefix}/invoice-imports/:id/draft`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await reviewService.getInvoiceImportDraftForUser(db, user.id, c.req.param('id')));
    });

    routes.patch(`${prefix}/invoice-imports/:id/draft`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = invoiceImportDraftPatchSchema.parse(await c.req.json());
      return c.json(await reviewService.patchInvoiceImportDraftForUser(db, user.id, c.req.param('id'), input));
    });

    routes.post(`${prefix}/invoice-imports/:id/commit`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = invoiceImportCommitRequestSchema.parse(await c.req.json().catch(() => ({})));
      return c.json(await reviewService.commitInvoiceImportForUser(db, user.id, c.req.param('id'), input), 201);
    });

    routes.get(`${prefix}/invoice-imports/:id/file`, async (c) => {
      const { db, user } = await requireSession(c);
      const result = await service.downloadInvoiceImportForUser(
        db,
        user.id,
        requireFileStorage(c),
        c.req.param('id'),
      );
      return new Response(result.file.bytes, {
        status: 200,
        headers: {
          'Content-Type': result.document.mimeType,
          'Content-Length': String(result.file.size),
          'Content-Disposition': contentDisposition(result.document.originalFilename),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    });

    routes.get(`${prefix}/invoice-imports/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.getInvoiceImportForUser(db, user.id, c.req.param('id')));
    });

    routes.delete(`${prefix}/invoice-imports/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.discardInvoiceImportForUser(db, user.id, c.req.param('id')));
    });
  }

  return routes;
}
