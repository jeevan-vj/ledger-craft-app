import { accountListResponseSchema, accountSchema, errorEnvelopeSchema } from '@ledgercraft/contracts';
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

describe('account write routes', () => {
  it('unauthenticated GET /api/accounts returns 401', async () => {
    const response = await createApp().request('/api/accounts');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('seeds a default chart and isolates organisations', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const ownership = await app.request('/api/accounts', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            name: 'Petty cash',
            type: 'cash',
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const seeded = await app.request('/api/accounts/initialize', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({}),
        });
        expect(seeded.status).toBe(200);
        const body = accountListResponseSchema.parse(await seeded.json());
        expect(body.accounts.some((account) => account.accountNumber === '1200')).toBe(true);
        expect(body.accounts.some((account) => account.accountNumber === '4000')).toBe(true);

        const created = await app.request('/api/accounts', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ name: 'Petty cash', type: 'cash', accountNumber: '1190' }),
        });
        expect(created.status).toBe(201);
        const account = accountSchema.parse(await created.json());
        expect(account.name).toBe('Petty cash');

        const hidden = await app.request('/api/accounts', {
          headers: { Cookie: ownerB.cookie },
        });
        expect(hidden.status).toBe(200);
        const other = accountListResponseSchema.parse(await hidden.json());
        expect(other.accounts.find((row) => row.id === account.id)).toBeUndefined();
      } finally {
        await sql.end();
      }
    });
  });
});
