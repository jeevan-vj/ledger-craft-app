/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { organisationMemberships } from '../../db/schema/identity';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { createMemoryFileStorage } from '../storage/file-storage';

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const fixtureDir = resolve(import.meta.dirname, '__fixtures__');

function cookie(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}

async function signUp(app: ReturnType<typeof createApp>, label: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ name: label, email: `${crypto.randomUUID()}@example.test`, password: 'password123' }),
  });
  return cookie(response);
}

async function uploadFixture(app: ReturnType<typeof createApp>, authCookie: string, filename: string, contentType = 'application/pdf') {
  const bytes = await readFile(resolve(fixtureDir, filename));
  const response = await app.request('/api/invoice-imports', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: authCookie },
    body: JSON.stringify({ files: [{ filename, contentType, contentBase64: bytes.toString('base64') }] }),
  });
  expect(response.status).toBe(201);
  return (await response.json() as any).documents[0] as { id: string };
}

async function setupContacts(app: ReturnType<typeof createApp>, authCookie: string) {
  await app.request('/api/business-profile', { method: 'PUT', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify({
    name: 'Crystal Touch Cleaning', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15', taxId: '111-222-333',
  }) });
  const customerResponse = await app.request('/api/customers', { method: 'POST', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify({
    name: 'Cleancorp Ltd', email: 'accounts@cleancorp.example.test', country: 'NZ',
  }) });
  const vendorResponse = await app.request('/api/vendors', { method: 'POST', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify({
    name: 'Sparkle Supplies Ltd', email: 'accounts@sparkle.example.test', taxId: '987-654-321',
  }) });
  return { customerId: (await customerResponse.json() as any).id as string, vendorId: (await vendorResponse.json() as any).id as string };
}

async function patchDraft(app: ReturnType<typeof createApp>, authCookie: string, id: string, body: Record<string, unknown>) {
  return app.request(`/api/invoice-imports/${id}/draft`, {
    method: 'PATCH', headers: { ...jsonHeaders, Cookie: authCookie }, body: JSON.stringify(body),
  });
}

describe('invoice import Phase 2 review and commit', () => {
  it('extracts and commits the Cleancorp buyer-created document as a linked draft sales invoice', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const fileStorage = createMemoryFileStorage();
        const app = createApp({ auth: createAuth(db), db, fileStorage });
        const owner = await signUp(app, 'Phase 2 Owner');
        const { customerId } = await setupContacts(app, owner);
        const document = await uploadFixture(app, owner, 'cleancorp-buyer-created-tax-invoice.pdf');

        const extracted = await app.request(`/api/invoice-imports/${document.id}/extract`, { method: 'POST', headers: { Cookie: owner } });
        expect(extracted.status).toBe(200);
        expect(await extracted.json()).toMatchObject({
          status: 'needs_review', provider: 'mock', mock: true, direction: null,
          draft: { issuerName: 'Cleancorp Ltd', net: '200.00', gst: '30.00', total: '230.00', suggestedDirection: 'SALES' },
          validationIssues: [], contactSuggestions: [{ contactType: 'customer', contactId: customerId, matchedBy: 'name' }],
        });

        const missingDirection = await app.request(`/api/invoice-imports/${document.id}/commit`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner }, body: '{}',
        });
        expect(missingDirection.status).toBe(422);
        expect(await missingDirection.json()).toMatchObject({ error: { code: 'DIRECTION_REQUIRED' } });

        const reviewed = await patchDraft(app, owner, document.id, { direction: 'SALES', thirdPartyIssued: true, contactId: customerId });
        expect(reviewed.status).toBe(200);
        const committed = await app.request(`/api/invoice-imports/${document.id}/commit`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner }, body: '{}',
        });
        expect(committed.status).toBe(201);
        const result = await committed.json() as any;
        expect(result).toMatchObject({ documentId: document.id, status: 'committed', recordType: 'invoice' });

        const [invoice] = await sql.unsafe(`SELECT status, source, external_number, external_issuer_name, import_document_id, third_party_issued FROM invoices WHERE id = ?`, [result.recordId]) as any[];
        expect(invoice).toEqual({ status: 'draft', source: 'import', external_number: 'CC-TEST-001', external_issuer_name: 'Cleancorp Ltd', import_document_id: document.id, third_party_issued: 1 });
        const [attachment] = await sql.unsafe(`SELECT id, role, locked, object_key FROM invoice_attachments WHERE invoice_id = ?`, [result.recordId]) as any[];
        expect(attachment).toMatchObject({ role: 'source_document', locked: 1 });
        expect(await sql.unsafe(`SELECT id FROM journal_entries WHERE reference_type = 'invoice' AND reference_id = ?`, [result.recordId])).toHaveLength(0);
        const events = await sql.unsafe(`SELECT action FROM import_document_events WHERE document_id = ? ORDER BY created_at`, [document.id]) as Array<{ action: string }>;
        expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(['extracted', 'reviewed', 'committed']));

        expect((await app.request(`/api/invoice-imports/${document.id}`, { method: 'DELETE', headers: { Cookie: owner } })).status).toBe(409);
        expect((await app.request(`/api/invoices/${result.recordId}/attachments/${attachment.id}`, { method: 'DELETE', headers: { Cookie: owner } })).status).toBe(409);
        expect((await app.request(`/api/invoice-imports/${document.id}/commit`, { method: 'POST', headers: { ...jsonHeaders, Cookie: owner }, body: '{}' })).status).toBe(409);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('blocks injection totals, permits a reviewed correction, and commits a draft purchase bill', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, fileStorage: createMemoryFileStorage() });
        const owner = await signUp(app, 'Purchase Owner');
        const { vendorId } = await setupContacts(app, owner);
        const injection = await uploadFixture(app, owner, 'prompt-injection-invoice.pdf');
        const extracted = await app.request(`/api/invoice-imports/${injection.id}/extract`, { method: 'POST', headers: { Cookie: owner } });
        expect(await extracted.json()).toMatchObject({
          draft: { total: '0.00' },
          validationIssues: [{ code: 'totals_mismatch', path: 'total', expected: '115.00', actual: '0.00', blocking: true }],
        });
        await patchDraft(app, owner, injection.id, { direction: 'PURCHASE', contactId: vendorId });
        const blocked = await app.request(`/api/invoice-imports/${injection.id}/commit`, { method: 'POST', headers: { ...jsonHeaders, Cookie: owner }, body: '{}' });
        expect(blocked.status).toBe(422);
        expect(await blocked.json()).toMatchObject({ error: { code: 'TOTALS_MISMATCH' } });
        const corrected = await patchDraft(app, owner, injection.id, { total: '115.00' });
        expect(await corrected.json()).toMatchObject({ validationIssues: [] });
        const committed = await app.request(`/api/invoice-imports/${injection.id}/commit`, { method: 'POST', headers: { ...jsonHeaders, Cookie: owner }, body: '{}' });
        expect(committed.status).toBe(201);
        const result = await committed.json() as any;
        expect(result.recordType).toBe('bill');
        const [bill] = await sql.unsafe(`SELECT lifecycle_status, source, external_number, import_document_id FROM bills WHERE id = ?`, [result.recordId]) as any[];
        expect(bill).toEqual({ lifecycle_status: 'draft', source: 'import', external_number: 'INJECT-TEST-001', import_document_id: injection.id });
        const [attachment] = await sql.unsafe(`SELECT role, locked FROM bill_attachments WHERE bill_id = ?`, [result.recordId]) as any[];
        expect(attachment).toEqual({ role: 'source_document', locked: 1 });
        expect(await sql.unsafe(`SELECT id FROM journal_entries WHERE reference_type = 'bill' AND reference_id = ?`, [result.recordId])).toHaveLength(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('requires duplicate acknowledgement and enforces read-only and organisation isolation on every Phase 2 route', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, fileStorage: createMemoryFileStorage() });
        const ownerA = await signUp(app, 'Org A');
        const ownerB = await signUp(app, 'Org B');
        const { vendorId } = await setupContacts(app, ownerA);
        await uploadFixture(app, ownerA, 'sparkle-supplies-bill.pdf');
        const duplicate = await uploadFixture(app, ownerA, 'sparkle-supplies-bill.pdf');
        await app.request(`/api/invoice-imports/${duplicate.id}/extract`, { method: 'POST', headers: { Cookie: ownerA } });
        await patchDraft(app, ownerA, duplicate.id, { direction: 'PURCHASE', contactId: vendorId });
        const warning = await app.request(`/api/invoice-imports/${duplicate.id}/commit`, { method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA }, body: '{}' });
        expect(warning.status).toBe(409);
        expect(await warning.json()).toMatchObject({ error: { code: 'DUPLICATE_WARNING' } });
        const acknowledged = await app.request(`/api/invoice-imports/${duplicate.id}/commit`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA }, body: JSON.stringify({ acknowledgeDuplicates: true }),
        });
        expect(acknowledged.status).toBe(201);

        for (const [method, suffix, body] of [
          ['POST', '/extract', undefined], ['GET', '/draft', undefined], ['PATCH', '/draft', { direction: 'PURCHASE' }], ['POST', '/commit', { acknowledgeDuplicates: true }],
        ] as const) {
          const response = await app.request(`/api/invoice-imports/${duplicate.id}${suffix}`, {
            method, headers: { ...jsonHeaders, Cookie: ownerB }, ...(body ? { body: JSON.stringify(body) } : {}),
          });
          expect(response.status).toBe(404);
        }

        const session = await createAuth(db).api.getSession({ headers: new Headers({ Cookie: ownerA }) });
        await db.update(organisationMemberships).set({ role: 'read_only' }).where(eq(organisationMemberships.userId, session!.user.id));
        expect((await app.request(`/api/invoice-imports/${duplicate.id}/draft`, { headers: { Cookie: ownerA } })).status).toBe(200);
        for (const [suffix, method, body] of [['/extract', 'POST', undefined], ['/draft', 'PATCH', { direction: 'PURCHASE' }], ['/commit', 'POST', { acknowledgeDuplicates: true }]] as const) {
          expect((await app.request(`/api/invoice-imports/${duplicate.id}${suffix}`, { method, headers: { ...jsonHeaders, Cookie: ownerA }, ...(body ? { body: JSON.stringify(body) } : {}) })).status).toBe(403);
        }
        await db.update(organisationMemberships).set({ role: 'member' }).where(eq(organisationMemberships.userId, session!.user.id));
        expect((await app.request(`/api/invoice-imports/${duplicate.id}/extract`, { method: 'POST', headers: { Cookie: ownerA } })).status).toBe(403);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
