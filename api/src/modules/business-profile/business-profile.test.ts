import { businessProfileSchema, errorEnvelopeSchema } from '@ledgercraft/contracts';
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
  return { email, cookie: cookieHeader(response) };
}

describe('business profile routes', () => {
  it('unauthenticated GET /api/business-profile returns 401', async () => {
    const response = await createApp().request('/api/business-profile');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('upserts a profile for the session organisation only', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const saved = await app.request('/api/business-profile', {
          method: 'PUT',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            name: 'Kauri Studio Ltd',
            email: 'hello@kauristudio.nz',
            country: 'NZ',
            defaultTaxRate: '15',
            gstRegistrationStatus: 'registered',
            bankAccountName: 'Kauri Studio Ltd',
            bankAccountNumber: '01-0123-0000123-00',
          }),
        });
        expect(saved.status).toBe(200);
        const profile = businessProfileSchema.parse(await saved.json());
        expect(profile.name).toBe('Kauri Studio Ltd');
        expect(profile.gstRegistrationStatus).toBe('registered');
        expect(profile).toMatchObject({ bankAccountName: 'Kauri Studio Ltd', bankAccountNumber: '01-0123-0000123-00' });
        const loaded = await app.request('/api/business-profile', { headers: { Cookie: ownerA.cookie } });
        expect(await loaded.json()).toMatchObject({ bankAccountName: 'Kauri Studio Ltd', bankAccountNumber: '01-0123-0000123-00' });
        const cleared = await app.request('/api/business-profile', { method: 'PUT', headers: { ...originHeaders, Cookie: ownerA.cookie }, body: JSON.stringify({ name: profile.name, email: profile.email, bankAccountName: null, bankAccountNumber: null }) });
        expect(await cleared.json()).toMatchObject({ bankAccountName: null, bankAccountNumber: null });
        expect(profile).not.toHaveProperty('organisationId');

        const leaked = await app.request('/api/business-profile', {
          headers: { Cookie: ownerB.cookie },
        });
        expect(leaked.status).toBe(404);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
