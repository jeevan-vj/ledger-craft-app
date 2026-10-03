import {
  errorEnvelopeSchema,
  taxConfigurationSchema,
  taxReturnListResponseSchema,
  taxReturnSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
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

describe('tax routes', () => {
  it('unauthenticated GET /api/tax-configurations returns 401', async () => {
    const response = await createApp().request('/api/tax-configurations');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('defaults NZ GST, upserts config, and isolates tax returns', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const defaults = await app.request('/api/tax-configurations', {
          headers: { Cookie: ownerA.cookie },
        });
        expect(defaults.status).toBe(200);
        const config = taxConfigurationSchema.parse(await defaults.json());
        expect(config.countryCode).toBe('NZ');
        expect(config.taxName).toBe('GST');
        expect(config.taxRate).toBe('0.15');

        const upserted = await app.request('/api/tax-configurations', {
          method: 'PUT',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ taxRate: '0.10' }),
        });
        expect(upserted.status).toBe(200);
        expect(taxConfigurationSchema.parse(await upserted.json()).taxRate).toBe('0.10');

        const created = await app.request('/api/tax-returns', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            periodStart: '2026-07-01',
            periodEnd: '2026-09-30',
            totalSales: '1150.00',
            totalPurchases: '230.00',
            gstOnSales: '150.00',
            gstOnPurchases: '30.00',
            netGst: '120.00',
            returnData: {
              gstReturn: {
                salesDetails: {
                  standardRated: 1150,
                  zeroRated: 0,
                  exempt: 0,
                  totalSales: 1150,
                  gstOnSales: 150,
                },
                purchaseDetails: {
                  standardRated: 230,
                  capitalGoods: 0,
                  totalPurchases: 230,
                  gstOnPurchases: 30,
                },
                adjustments: { badDebts: 0, otherAdjustments: 0 },
              },
              reconciliation: {
                status: 'ready',
                unreconciledTransactionCount: 0,
                figuresMatch: true,
                accounts: [],
                issues: [],
              },
            },
          }),
        });
        expect(created.status).toBe(201);
        const taxReturn = taxReturnSchema.parse(await created.json());
        expect(taxReturn.netGst).toBe('120.00');
        expect(taxReturn.returnData?.reconciliation?.status).toBe('ready');

        const missingReference = await app.request(`/api/tax-returns/${taxReturn.id}/file`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ irdReference: '' }),
        });
        expect(missingReference.status).toBe(400);

        const bypassFiling = await app.request(`/api/tax-returns/${taxReturn.id}`, {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ status: 'submitted' }),
        });
        expect(bypassFiling.status).toBe(400);

        const filed = await app.request(`/api/tax-returns/${taxReturn.id}/file`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ irdReference: 'GST-2026-12345' }),
        });
        expect(filed.status).toBe(200);
        const filedReturn = taxReturnSchema.parse(await filed.json());
        expect(filedReturn.status).toBe('submitted');
        expect(filedReturn.irdReference).toBe('GST-2026-12345');
        expect(filedReturn.submittedAt).not.toBeNull();
        expect(filedReturn.returnData?.reconciliation?.status).toBe('ready');

        const filedTwice = await app.request(`/api/tax-returns/${taxReturn.id}/file`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ irdReference: 'GST-2026-duplicate' }),
        });
        expect(filedTwice.status).toBe(409);

        const ownership = await app.request('/api/tax-returns', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            periodStart: '2026-04-01',
            periodEnd: '2026-06-30',
            totalSales: '0.00',
            totalPurchases: '0.00',
            gstOnSales: '0.00',
            gstOnPurchases: '0.00',
            netGst: '0.00',
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const listA = taxReturnListResponseSchema.parse(
          await (await app.request('/api/tax-returns', { headers: { Cookie: ownerA.cookie } })).json(),
        );
        expect(listA.taxReturns.map((row) => row.id)).toEqual([taxReturn.id]);
        expect(listA.taxReturns[0]?.returnData?.gstReturn?.salesDetails.totalSales).toBe(1150);

        const listB = taxReturnListResponseSchema.parse(
          await (await app.request('/api/tax-returns', { headers: { Cookie: ownerB.cookie } })).json(),
        );
        expect(listB.taxReturns).toEqual([]);

        const leaked = await app.request(`/api/tax-returns/${taxReturn.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(leaked.status).toBe(404);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
