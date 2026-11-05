import { invoiceSchema, quoteSchema, shareInvoiceResponseSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from './auth';
import { purgeLocalOrganisationData } from './local-organisation-purge';
import { createMemoryObjectStore } from '../storage/object-store';

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const cookie = (response: Response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

async function createOwner(app: ReturnType<typeof createApp>, label: string) {
  const email = `${label.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`;
  const response = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ name: label, email, password: 'password123' }) });
  expect(response.status).toBe(200);
  const authHeaders = { ...jsonHeaders, Cookie: cookie(response) };
  await app.request('/api/business-profile', { method: 'PUT', headers: authHeaders, body: JSON.stringify({ name: `${label} Ltd`, email, country: 'NZ', defaultTaxRate: '15' }) });
  const customerResponse = await app.request('/api/customers', { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: 'Customer', email: 'customer@example.com', country: 'NZ' }) });
  return { email, headers: authHeaders, customerId: ((await customerResponse.json()) as { id: string }).id };
}

async function createPublicLinks(app: ReturnType<typeof createApp>, owner: Awaited<ReturnType<typeof createOwner>>) {
  const invoiceResponse = await app.request('/api/invoices', { method: 'POST', headers: owner.headers, body: JSON.stringify({ customerId: owner.customerId, date: '2026-11-06', dueDate: '2026-11-20', items: [{ description: 'Work', quantity: '1', rate: '100' }] }) });
  const invoice = invoiceSchema.parse(await invoiceResponse.json());
  const invoiceShare = shareInvoiceResponseSchema.parse(await (await app.request(`/api/invoices/${invoice.id}/share`, { method: 'POST', headers: owner.headers, body: JSON.stringify({ templateName: 'classic' }) })).json());

  const quoteResponse = await app.request('/api/quotes', { method: 'POST', headers: { ...owner.headers, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ customerId: owner.customerId, date: '2026-11-06', expiryDate: '2026-12-06', items: [{ description: 'Future work', quantity: '1', rate: '200' }] }) });
  const quote = quoteSchema.parse(await quoteResponse.json());
  const quoteShare = (await (await app.request(`/api/quotes/${quote.id}/share`, { method: 'POST', headers: owner.headers, body: '{}' })).json()) as { shareToken: string };
  return { invoiceToken: invoiceShare.shareToken, quoteToken: quoteShare.shareToken };
}

describe('account deletion public data purge', () => {
  it('turns previously valid invoice and quote links into 404 while leaving another tenant valid', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const objectStore = createMemoryObjectStore();
        const app = createApp({ auth: createAuth(db), db, objectStore, purgeOrganisation: async (id) => {
          await purgeLocalOrganisationData(db, { objectStore }, id);
        } });
        const deletingOwner = await createOwner(app, 'Deleting Owner');
        const otherOwner = await createOwner(app, 'Other Owner');
        const deletingLinks = await createPublicLinks(app, deletingOwner);
        const otherLinks = await createPublicLinks(app, otherOwner);
        const uploaded = (await (await app.request('/api/objects', { method: 'POST', headers: deletingOwner.headers, body: JSON.stringify({ kind: 'logo', filename: 'logo.png', contentType: 'image/png', contentBase64: 'aGVsbG8=' }) })).json()) as { key: string };
        expect(await objectStore.get(uploaded.key)).toBeTruthy();

        expect((await app.request(`/api/public/invoices/${deletingLinks.invoiceToken}`)).status).toBe(200);
        expect((await app.request(`/api/public/quotes/${deletingLinks.quoteToken}`)).status).toBe(200);
        expect((await app.request('/api/me', { method: 'DELETE', headers: deletingOwner.headers, body: JSON.stringify({ password: 'password123', confirmation: 'DELETE' }) })).status).toBe(200);

        expect((await app.request(`/api/public/invoices/${deletingLinks.invoiceToken}`)).status).toBe(404);
        expect((await app.request(`/api/public/quotes/${deletingLinks.quoteToken}`)).status).toBe(404);
        expect(await objectStore.get(uploaded.key)).toBeUndefined();
        expect((await app.request(`/api/public/invoices/${otherLinks.invoiceToken}`)).status).toBe(200);
        expect((await app.request(`/api/public/quotes/${otherLinks.quoteToken}`)).status).toBe(200);
      } finally { await sql.end({ timeout: 5 }); }
    });
  });
});
