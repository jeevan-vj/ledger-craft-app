import {
  errorEnvelopeSchema,
  invoiceSchema,
  invoiceShareListResponseSchema,
  revokeInvoiceSharesResponseSchema,
  shareInvoiceResponseSchema,
} from '@ledgercraft/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { organisationMemberships } from '../../db/schema/identity';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

const originHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`;
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: originHeaders,
    body: JSON.stringify({ name, email, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return { cookie: cookieHeader(response) };
}

async function seedCustomerAndProfile(app: ReturnType<typeof createApp>, cookie: string) {
  await app.request('/api/business-profile', {
    method: 'PUT',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      name: 'Kauri Studio Ltd',
      email: 'hello@kauristudio.nz',
      country: 'NZ',
      defaultTaxRate: '15',
      invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
      invoiceNumberSequence: 0,
    }),
  });
  const customer = await app.request('/api/customers', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'North Harbour Cafe', email: 'hello@nhcafe.nz', country: 'NZ' }),
  });
  expect(customer.status).toBe(201);
  return (await customer.json()) as { id: string };
}

async function createInvoice(app: ReturnType<typeof createApp>, cookie: string, customerId: string) {
  const created = await app.request('/api/invoices', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      customerId,
      date: '2026-10-24',
      dueDate: '2026-11-24',
      taxInclusive: false,
      taxRate: '15',
      items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
    }),
  });
  expect(created.status).toBe(201);
  return invoiceSchema.parse(await created.json());
}

describe('invoice share links', () => {
  it('lists, reuses, and revokes shares inside the organisation and hides them from another organisation', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Share Owner A');
        const ownerB = await signUp(app, 'Share Owner B');
        const customer = await seedCustomerAndProfile(app, ownerA.cookie);
        const invoice = await createInvoice(app, ownerA.cookie, customer.id);
        const other = await createInvoice(app, ownerA.cookie, customer.id);
        const headersA = { ...originHeaders, Cookie: ownerA.cookie };
        const headersB = { ...originHeaders, Cookie: ownerB.cookie };

        const unauthenticated = await createApp().request(`/api/invoices/${invoice.id}/shares`);
        expect(unauthenticated.status).toBe(401);

        const leakedList = await app.request(`/api/invoices/${invoice.id}/shares`, { headers: headersB });
        expect(leakedList.status).toBe(404);
        const leakedRevoke = await app.request(`/api/invoices/${invoice.id}/shares/revoke`, {
          method: 'POST',
          headers: headersB,
        });
        expect(leakedRevoke.status).toBe(404);
        const leakedReplace = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: headersB,
          body: JSON.stringify({ replace: true, templateName: 'classic' }),
        });
        expect(leakedReplace.status).toBe(404);

        const created = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: headersA,
          body: JSON.stringify({ templateName: 'classic' }),
        });
        expect(created.status).toBe(201);
        const classic = shareInvoiceResponseSchema.parse(await created.json());
        expect(classic.templateName).toBe('classic');
        expect(classic.accessCount).toBe(0);
        expect(classic.isActive).toBe(true);
        expect(classic.expiresAt).toBeNull();

        const reused = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: headersA,
          body: JSON.stringify({ templateName: 'classic', replace: false }),
        });
        expect(reused.status).toBe(200);
        expect(shareInvoiceResponseSchema.parse(await reused.json()).shareToken).toBe(classic.shareToken);
        const ignoredExpiry = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: headersA,
          body: JSON.stringify({ templateName: 'classic', expiresAt: '2020-01-01T00:00:00.000Z' }),
        });
        expect(ignoredExpiry.status).toBe(200);
        expect(shareInvoiceResponseSchema.parse(await ignoredExpiry.json()).shareToken).toBe(classic.shareToken);

        const modern = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: headersA,
          body: JSON.stringify({ templateName: 'modern' }),
        });
        expect(modern.status).toBe(201);
        const modernShare = shareInvoiceResponseSchema.parse(await modern.json());
        expect(modernShare.shareToken).not.toBe(classic.shareToken);

        const expired = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers: headersA,
          body: JSON.stringify({ templateName: 'minimal', expiresAt: '2020-01-01T00:00:00.000Z' }),
        });
        expect(expired.status).toBe(201);
        const expiredShare = shareInvoiceResponseSchema.parse(await expired.json());

        const otherShare = shareInvoiceResponseSchema.parse(await (await app.request(`/api/invoices/${other.id}/share`, {
          method: 'POST',
          headers: headersA,
          body: JSON.stringify({ templateName: 'classic' }),
        })).json());

        const listed = await app.request(`/api/invoices/${invoice.id}/shares`, { headers: headersA });
        expect(listed.status).toBe(200);
        const shares = invoiceShareListResponseSchema.parse(await listed.json()).shares;
        expect(shares.map((share) => share.shareToken).sort()).toEqual([classic.shareToken, modernShare.shareToken].sort());
        expect(Date.parse(shares[0].createdAt)).toBeGreaterThanOrEqual(Date.parse(shares[1].createdAt));
        expect(shares.every((share) => share.isActive)).toBe(true);

        const viewed = await app.request(`/api/public/invoices/${classic.shareToken}`);
        expect(viewed.status).toBe(200);
        const viewedAgain = await app.request(`/api/public/invoices/${classic.shareToken}`);
        expect(viewedAgain.status).toBe(200);
        const counted = invoiceShareListResponseSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}/shares`, { headers: headersA })).json(),
        );
        expect(counted.shares.find((share) => share.shareToken === classic.shareToken)?.accessCount).toBe(2);

        const inactive = await app.request(`/api/public/invoices/${expiredShare.shareToken}`);
        expect(inactive.status).toBe(410);
        const inactiveBody = errorEnvelopeSchema.parse(await inactive.json());
        expect(inactiveBody.error.code).toBe('SHARE_INACTIVE');
        expect(inactiveBody.error.message).toBe('This link is no longer active');
        expect(JSON.stringify(inactiveBody)).not.toContain(invoice.id);

        const revoked = await app.request(`/api/invoices/${invoice.id}/shares/revoke`, {
          method: 'POST',
          headers: headersA,
        });
        expect(revoked.status).toBe(200);
        expect(revokeInvoiceSharesResponseSchema.parse(await revoked.json()).revoked).toBe(3);
        expect(invoiceShareListResponseSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}/shares`, { headers: headersA })).json(),
        ).shares).toEqual([]);

        for (const token of [classic.shareToken, modernShare.shareToken, expiredShare.shareToken]) {
          const response = await app.request(`/api/public/invoices/${token}`);
          expect(response.status).toBe(410);
          expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('SHARE_INACTIVE');
        }
        const [expiredCount] = await sql.unsafe(
          'SELECT access_count FROM shared_invoices WHERE share_token = ?',
          [expiredShare.shareToken],
        );
        expect(Number(expiredCount.access_count)).toBe(0);
        const stillThere = await app.request(`/api/public/invoices/${otherShare.shareToken}`);
        expect(stillThere.status).toBe(200);

        const again = await app.request(`/api/invoices/${invoice.id}/shares/revoke`, {
          method: 'POST',
          headers: headersA,
        });
        expect(revokeInvoiceSharesResponseSchema.parse(await again.json()).revoked).toBe(0);

        const missing = await app.request('/api/public/invoices/does-not-exist-token');
        expect(missing.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await missing.json()).error.code).toBe('NOT_FOUND');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('replaces every active link in one transaction and keeps the old link when creation fails', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Replace Owner');
        const customer = await seedCustomerAndProfile(app, owner.cookie);
        const invoice = await createInvoice(app, owner.cookie, customer.id);
        const headers = { ...originHeaders, Cookie: owner.cookie };
        const first = shareInvoiceResponseSchema.parse(await (await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ templateName: 'classic' }),
        })).json());
        const second = shareInvoiceResponseSchema.parse(await (await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ templateName: 'executive' }),
        })).json());

        await sql.exec(`
          CREATE TRIGGER shared_invoices_reject_insert
          BEFORE INSERT ON shared_invoices
          BEGIN
            SELECT RAISE(ABORT, 'injected share insert failure');
          END;
        `);
        const failed = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ replace: true, templateName: 'classic' }),
        });
        expect(failed.status).toBe(500);
        expect((await app.request(`/api/public/invoices/${first.shareToken}`)).status).toBe(200);
        expect((await app.request(`/api/public/invoices/${second.shareToken}`)).status).toBe(200);
        await sql.exec('DROP TRIGGER shared_invoices_reject_insert');

        const replaced = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ replace: true, templateName: 'classic' }),
        });
        expect(replaced.status).toBe(201);
        const fresh = shareInvoiceResponseSchema.parse(await replaced.json());
        expect(fresh.shareToken).not.toBe(first.shareToken);
        expect(fresh.templateName).toBe('classic');
        expect((await app.request(`/api/public/invoices/${first.shareToken}`)).status).toBe(410);
        expect((await app.request(`/api/public/invoices/${second.shareToken}`)).status).toBe(410);
        expect((await app.request(`/api/public/invoices/${fresh.shareToken}`)).status).toBe(200);
        const remaining = invoiceShareListResponseSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}/shares`, { headers })).json(),
        );
        expect(remaining.shares.map((share) => share.shareToken)).toEqual([fresh.shareToken]);
      } finally {
        await sql.exec('DROP TRIGGER IF EXISTS shared_invoices_reject_insert').catch(() => undefined);
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('lets a read-only member list shares but not create, replace, or revoke them', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Read Only Share');
        const customer = await seedCustomerAndProfile(app, owner.cookie);
        const invoice = await createInvoice(app, owner.cookie, customer.id);
        const headers = { ...originHeaders, Cookie: owner.cookie };
        const share = shareInvoiceResponseSchema.parse(await (await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ templateName: 'classic' }),
        })).json());
        const session = await auth.api.getSession({ headers: new Headers({ Cookie: owner.cookie }) });
        expect(session?.user.id).toBeTruthy();
        await db.update(organisationMemberships).set({ role: 'read_only' }).where(eq(organisationMemberships.userId, session!.user.id));

        const listed = await app.request(`/api/invoices/${invoice.id}/shares`, { headers });
        expect(listed.status).toBe(200);
        expect(invoiceShareListResponseSchema.parse(await listed.json()).shares).toHaveLength(1);

        const revoke = await app.request(`/api/invoices/${invoice.id}/shares/revoke`, { method: 'POST', headers });
        expect(revoke.status).toBe(403);
        const replace = await app.request(`/api/invoices/${invoice.id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ replace: true }),
        });
        expect(replace.status).toBe(403);
        expect((await app.request(`/api/public/invoices/${share.shareToken}`)).status).toBe(200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
