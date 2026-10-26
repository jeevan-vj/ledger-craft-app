/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { organisationMemberships } from '../../db/schema/identity';
import { importDocumentEvents } from '../../db/schema/invoice-imports';
import { invoices } from '../../db/schema/invoices';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { createMemoryFileStorage } from '../storage/file-storage';

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const pdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Page >>\n%%EOF');
const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

function cookie(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}

async function signUp(app: ReturnType<typeof createApp>, label: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ name: label, email: `${crypto.randomUUID()}@example.test`, password: 'password123' }),
  });
  expect(response.status).toBe(200);
  return cookie(response);
}

async function upload(app: ReturnType<typeof createApp>, authCookie: string, overrides: Record<string, unknown> = {}) {
  return app.request('/api/invoice-imports', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: authCookie },
    body: JSON.stringify({ files: [{
      filename: '../private/Cleancorp\u0000 invoice.pdf',
      contentType: 'application/pdf', contentBase64: pdfBase64, ...overrides,
    }] }),
  });
}

describe('invoice import routes', () => {
  it('uploads, detects same-org duplicate hashes, lists/downloads privately, audits, and isolates every id route', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const fileStorage = createMemoryFileStorage();
        const app = createApp({ auth: createAuth(db), db, fileStorage });
        const ownerA = await signUp(app, 'Import Owner A');
        const ownerB = await signUp(app, 'Import Owner B');

        const firstResponse = await upload(app, ownerA);
        expect(firstResponse.status).toBe(201);
        const first = await firstResponse.json() as any;
        expect(first.batch).toMatchObject({ status: 'uploaded', fileCount: 1 });
        expect(first.documents[0]).toMatchObject({
          status: 'uploaded', originalFilename: 'Cleancorp invoice.pdf', mimeType: 'application/pdf',
          pageCount: 1, duplicateOfDocumentId: null,
        });
        expect(first.documents[0]).not.toHaveProperty('storageKey');
        expect(first.duplicateWarnings).toEqual([]);

        const duplicateResponse = await upload(app, ownerA, { filename: 'same-content.pdf' });
        expect(duplicateResponse.status).toBe(201);
        const duplicate = await duplicateResponse.json() as any;
        expect(duplicate.duplicateWarnings).toEqual([{
          documentId: duplicate.documents[0].id,
          existingDocumentId: first.documents[0].id,
          sha256: first.documents[0].sha256,
        }]);
        expect(duplicate.documents[0].duplicateOfDocumentId).toBe(first.documents[0].id);

        const list = await app.request('/api/invoice-imports', { headers: { Cookie: ownerA } });
        expect(list.status).toBe(200);
        expect((await list.json() as any).documents).toHaveLength(2);
        const detail = await app.request(`/api/invoice-imports/${first.documents[0].id}`, { headers: { Cookie: ownerA } });
        expect(detail.status).toBe(200);

        const download = await app.request(`/api/invoice-imports/${first.documents[0].id}/file`, { headers: { Cookie: ownerA } });
        expect(download.status).toBe(200);
        expect(new Uint8Array(await download.arrayBuffer())).toEqual(pdfBytes);
        expect(download.headers.get('content-type')).toBe('application/pdf');
        expect(download.headers.get('content-disposition')).toBe('attachment; filename="Cleancorp invoice.pdf"');
        expect(download.headers.get('cache-control')).toBe('private, no-store');
        expect(download.headers.get('x-content-type-options')).toBe('nosniff');

        for (const [method, suffix] of [['GET', ''], ['GET', '/file'], ['DELETE', '']] as const) {
          const response = await app.request(`/api/invoice-imports/${first.documents[0].id}${suffix}`, {
            method, headers: { Cookie: ownerB },
          });
          expect(response.status).toBe(404);
        }

        const discarded = await app.request(`/api/invoice-imports/${first.documents[0].id}`, {
          method: 'DELETE', headers: { Cookie: ownerA },
        });
        expect(discarded.status).toBe(200);
        expect((await discarded.json() as any).document.status).toBe('discarded');
        const stored = await fileStorage.get(`${first.documents[0].id}`);
        expect(stored).toBeUndefined(); // storage keys are private, checked below from the database
        const [row] = await sql.unsafe('SELECT storage_key FROM import_documents WHERE id = ?', [first.documents[0].id]) as Array<{ storage_key: string }>;
        expect(await fileStorage.head(row!.storage_key)).toBeDefined();

        const events = await db.select().from(importDocumentEvents)
          .where(eq(importDocumentEvents.documentId, first.documents[0].id));
        expect(events.map((event) => event.action)).toEqual(expect.arrayContaining([
          'uploaded', 'metadata_viewed', 'file_downloaded', 'delete_attempted', 'discarded',
        ]));
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('rejects read-only upload, bad magic, MIME mismatch, and oversized files with explicit statuses', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, fileStorage: createMemoryFileStorage() });
        const authCookie = await signUp(app, 'Validation Owner');
        const session = await createAuth(db).api.getSession({ headers: new Headers({ Cookie: authCookie }) });

        expect((await upload(app, authCookie, {
          contentBase64: Buffer.from('not a file').toString('base64'),
        })).status).toBe(415);
        expect((await upload(app, authCookie, {
          contentBase64: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64'),
        })).status).toBe(415);
        expect((await upload(app, authCookie, {
          contentBase64: Buffer.alloc(1024 * 1024 + 1, 1).toString('base64'),
        })).status).toBe(413);

        await db.update(organisationMemberships).set({ role: 'read_only' })
          .where(eq(organisationMemberships.userId, session!.user.id));
        expect((await upload(app, authCookie)).status).toBe(403);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('blocks discard while a linked invoice exists and audits the failed attempt', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, fileStorage: createMemoryFileStorage() });
        const authCookie = await signUp(app, 'Linked Import Owner');
        const created = await upload(app, authCookie);
        const document = (await created.json() as any).documents[0];
        await app.request('/api/business-profile', { method: 'PUT', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify({
          name: 'Linked Studio', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15',
        }) });
        const customerResponse = await app.request('/api/customers', { method: 'POST', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify({
          name: 'Import Customer', email: 'customer@example.test', country: 'NZ',
        }) });
        const customer = await customerResponse.json() as { id: string };
        const invoiceResponse = await app.request('/api/invoices', { method: 'POST', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify({
          customerId: customer.id, date: '2026-10-26', dueDate: '2026-11-26',
          items: [{ description: 'Imported work', quantity: '1', rate: '10' }],
        }) });
        const invoice = await invoiceResponse.json() as { id: string };
        await db.update(invoices).set({ importDocumentId: document.id }).where(eq(invoices.id, invoice.id));

        const blocked = await app.request(`/api/invoice-imports/${document.id}`, {
          method: 'DELETE', headers: { Cookie: authCookie },
        });
        expect(blocked.status).toBe(409);
        const [row] = await sql.unsafe('SELECT status FROM import_documents WHERE id = ?', [document.id]) as Array<{ status: string }>;
        expect(row!.status).toBe('uploaded');
        const events = await db.select().from(importDocumentEvents).where(eq(importDocumentEvents.documentId, document.id));
        expect(events.map((event) => event.action)).toContain('delete_attempted');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
