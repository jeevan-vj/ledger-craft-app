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

  it('saves mobile onboarding for both GST choices and leaves nothing behind on validation failure', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });

        for (const status of ['registered', 'not_registered'] as const) {
          const owner = await signUp(app, status === 'registered' ? 'Registered Owner' : 'Unregistered Owner');
          const saved = await app.request('/api/business-profile', {
            method: 'PUT',
            headers: { ...originHeaders, Cookie: owner.cookie },
            body: JSON.stringify(mobileOnboardingPayload(status)),
          });
          expect(saved.status).toBe(200);
          const profile = businessProfileSchema.parse(await saved.json());
          expect(profile.gstRegistrationStatus).toBe(status);
          expect(profile.defaultTaxRate).toBe(status === 'registered' ? '15' : '0');
          expect(profile.country).toBe('New Zealand');
          expect(profile.theme).toEqual({
            primary: '#163300',
            secondary: '#3B4DE6',
            accent: '#4F63D7',
            text: '#1E293B',
            textLight: '#64748B',
            background: '#F5F6F3',
            surface: '#FFFFFF',
          });

          const explicit = await app.request('/api/business-profile', {
            method: 'PUT',
            headers: { ...originHeaders, Cookie: owner.cookie },
            body: JSON.stringify({
              ...mobileOnboardingPayload(status),
              theme: { ...mobileOnboardingPayload(status).theme, background: '#FFFFFF' },
            }),
          });
          expect(explicit.status).toBe(200);
          expect(businessProfileSchema.parse(await explicit.json()).theme).toMatchObject({ background: '#FFFFFF' });
        }

        const owner = await signUp(app, 'Invalid GST');
        const rejected = await app.request('/api/business-profile', {
          method: 'PUT',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ ...mobileOnboardingPayload('registered'), gstRegistrationStatus: 'sometimes' }),
        });
        expect(rejected.status).toBe(400);
        const error = errorEnvelopeSchema.parse(await rejected.json());
        expect(error.error.code).toBe('VALIDATION_ERROR');
        expect(error.error.message).toMatch(/gstRegistrationStatus/);
        const missing = await app.request('/api/business-profile', { headers: { Cookie: owner.cookie } });
        expect(missing.status).toBe(404);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});

// Issue #45: the installed iOS onboarding build sent this theme without background.
function mobileOnboardingPayload(status: 'registered' | 'not_registered') {
  return {
    name: 'Kauri Studio Ltd',
    email: 'hello@kauristudio.nz',
    country: 'New Zealand',
    invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
    defaultTaxRate: status === 'registered' ? '15' : '0',
    gstRegistrationStatus: status,
    phone: '+64 21 555 0101',
    address: null,
    city: null,
    state: null,
    zip: null,
    logoUrl: null,
    theme: {
      name: 'Professional',
      primary: '#163300',
      secondary: '#3B4DE6',
      accent: '#4F63D7',
      surface: '#FFFFFF',
      text: '#1E293B',
      textLight: '#64748B',
    },
  };
}
