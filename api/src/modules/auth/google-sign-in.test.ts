import { meResponseSchema } from '@ledgercraft/contracts';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { authAccounts, organisationMemberships, organisations, users } from '../../db/schema/identity';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from './auth';

const origin = 'http://localhost:8080';
const googleEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
};

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

function jsonHeaders(extra: Record<string, string> = {}) {
  return { 'Content-Type': 'application/json', Origin: origin, ...extra };
}

function googleIdToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`;
}

function restoreGoogleEnv() {
  for (const [key, value] of Object.entries(googleEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function useGoogleCredentials(enabled: boolean) {
  if (enabled) {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  } else {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  }
  process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'http://localhost:8080,easybizinvoice://';
}

afterEach(() => {
  restoreGoogleEnv();
  vi.restoreAllMocks();
});

async function withAuthApp(run: (app: ReturnType<typeof createApp>, db: ReturnType<typeof createDb>['db']) => Promise<void>) {
  await assertLocalDatabaseReachable();
  await withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
      await run(app, db);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
}

async function signUpPassword(app: ReturnType<typeof createApp>, email: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ name: 'Password Owner', email, password: 'password123' }),
  });
  expect(response.status).toBe(200);
  return response;
}

function mockGoogleToken(claims: Record<string, unknown>) {
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({
        access_token: 'google-access',
        refresh_token: 'google-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        id_token: googleIdToken(claims),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return original(input, init);
  });
}

async function startGoogle(app: ReturnType<typeof createApp>, callbackURL: string) {
  return app.request('/api/auth/sign-in/social', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      provider: 'google',
      callbackURL,
      errorCallbackURL: `${origin}/login`,
      disableRedirect: true,
    }),
  });
}

async function finishGoogle(app: ReturnType<typeof createApp>, start: Response, claims: Record<string, unknown>, search = '') {
  const body = await start.json() as { url?: string };
  const state = new URL(body.url ?? '').searchParams.get('state');
  expect(state).toBeTruthy();
  mockGoogleToken(claims);
  return app.request(`/api/auth/callback/google?code=google-code&state=${state}${search}`, {
    headers: { Cookie: cookieHeader(start), Origin: origin },
    redirect: 'manual',
  });
}

describe('Google sign-in', () => {
  it('reports Google as disabled and rejects social sign-in when either credential is missing', async () => {
    useGoogleCredentials(false);
    await withAuthApp(async (app) => {
      const providers = await app.request('/api/auth/providers', { headers: { Origin: origin } });
      expect(providers.status).toBe(200);
      expect(await providers.json()).toEqual({ google: false });

      const signIn = await startGoogle(app, `${origin}/auth/callback`);
      expect(signIn.status).toBeGreaterThanOrEqual(400);
      expect(signIn.status).toBeLessThan(500);
      const body = await signIn.json() as { message?: string; code?: string; error?: { message?: string; code?: string } };
      const message = body.error?.message ?? body.message ?? '';
      const code = body.error?.code ?? body.code;
      expect(message).toMatch(/not configured/i);
      expect(code).toBe('GOOGLE_SIGN_IN_DISABLED');
      expect(JSON.stringify(body)).not.toMatch(/test-google-secret|client_secret/i);
    });
  });

  it('starts the Google redirect when both credentials are set and rate limits that endpoint', async () => {
    useGoogleCredentials(true);
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({
          auth: createAuth(db, { enableRateLimit: true }),
          db,
          checkDatabase: async () => true,
        });
        const providers = await app.request('/api/auth/providers', { headers: { Origin: origin } });
        expect(await providers.json()).toEqual({ google: true });

        const statuses: number[] = [];
        let authorizationUrl = '';
        for (let attempt = 0; attempt < 11; attempt += 1) {
          const response = await app.request('/api/auth/sign-in/social', {
            method: 'POST',
            headers: jsonHeaders({ 'X-Forwarded-For': '203.0.113.40' }),
            body: JSON.stringify({
              provider: 'google',
              callbackURL: `${origin}/auth/callback`,
              errorCallbackURL: `${origin}/login`,
              disableRedirect: true,
            }),
          });
          statuses.push(response.status);
          if (attempt === 0) {
            const body = await response.json() as { url?: string };
            authorizationUrl = body.url ?? '';
          }
        }
        expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
        expect(statuses[10]).toBe(429);
        const redirect = new URL(authorizationUrl);
        expect(redirect.origin).toBe('https://accounts.google.com');
        expect(redirect.searchParams.get('client_id')).toBe('test-google-client');
        expect(redirect.searchParams.get('redirect_uri')).toBe('http://localhost:8080/api/auth/callback/google');
        expect(authorizationUrl).not.toContain('test-google-secret');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('links a verified Google email to the existing password user and does not provision a second organisation', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app, db) => {
      const email = `link-${crypto.randomUUID()}@example.com`;
      await signUpPassword(app, email);
      const [before] = await db.select().from(users).where(eq(users.email, email));
      expect(before?.emailVerified).toBe(false);
      const [membership] = await db.select().from(organisationMemberships).where(eq(organisationMemberships.userId, before!.id));
      const organisationCount = await db.select().from(organisations);

      const start = await startGoogle(app, `${origin}/auth/callback`);
      expect(start.status).toBe(200);
      const callback = await finishGoogle(app, start, {
        sub: 'google-subject-1',
        email,
        email_verified: true,
        name: 'Password Owner',
      });
      expect(callback.status).toBe(302);
      expect(callback.headers.get('location')).toBe(`${origin}/auth/callback`);

      const people = await db.select().from(users).where(eq(users.email, email));
      expect(people).toHaveLength(1);
      expect(people[0]?.id).toBe(before?.id);
      const accounts = await db.select().from(authAccounts).where(eq(authAccounts.userId, before!.id));
      expect(accounts.map((account) => account.providerId).sort()).toEqual(['credential', 'google']);
      expect(await db.select().from(organisations)).toHaveLength(organisationCount.length);

      const me = await app.request('/api/me', { headers: { Cookie: cookieHeader(callback), Origin: origin } });
      expect(me.status).toBe(200);
      const session = meResponseSchema.parse(await me.json());
      expect(session.user.id).toBe(before?.id);
      expect(session.organisation.id).toBe(membership?.organisationId);
    });
  });

  it('does not link or create a user when Google does not assert a verified email', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app, db) => {
      const email = `unverified-${crypto.randomUUID()}@example.com`;
      await signUpPassword(app, email);
      const beforeUsers = await db.select().from(users);
      const beforeAccounts = await db.select().from(authAccounts);

      const start = await startGoogle(app, `${origin}/auth/callback`);
      const callback = await finishGoogle(app, start, {
        sub: 'google-subject-unverified',
        email,
        email_verified: false,
        name: 'Unverified',
      });
      expect(callback.status).toBe(302);
      expect(callback.headers.get('location')).toContain('error=unable_to_get_user_info');
      expect(await db.select().from(users)).toHaveLength(beforeUsers.length);
      expect(await db.select().from(authAccounts)).toHaveLength(beforeAccounts.length);
      expect((await db.select().from(authAccounts)).some((account) => account.providerId === 'google')).toBe(false);
    });
  });

  it('provisions an organisation for a new verified Google user and hands the session to the mobile scheme', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app, db) => {
      const email = `new-${crypto.randomUUID()}@example.com`;
      const start = await startGoogle(app, 'easybizinvoice://auth/google');
      expect(start.status).toBe(200);
      const callback = await finishGoogle(app, start, {
        sub: 'google-subject-new',
        email,
        email_verified: true,
        name: 'New Google',
      });
      expect(callback.status).toBe(302);
      const location = callback.headers.get('location') ?? '';
      expect(location.startsWith('easybizinvoice://auth/google')).toBe(true);
      expect(location).toContain('cookie=');
      expect(decodeURIComponent(location)).toContain('session_token=');

      const [user] = await db.select().from(users).where(eq(users.email, email));
      expect(user?.name).toBe('New Google');
      const [membership] = await db.select().from(organisationMemberships).where(eq(organisationMemberships.userId, user!.id));
      const [organisation] = await db.select().from(organisations).where(eq(organisations.id, membership!.organisationId));
      expect(organisation?.name).toBe("New Google's organisation");
      expect(membership?.role).toBe('owner');
    });
  });

  it('redirects callback failures for a missing state, a denied consent, a bad code, and a state mismatch', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app) => {
      const missing = await app.request('/api/auth/callback/google?code=orphan', {
        headers: { Origin: origin },
        redirect: 'manual',
      });
      expect(missing.status).toBe(302);
      expect(missing.headers.get('location')).toContain('error=state_not_found');

      const start = await startGoogle(app, `${origin}/auth/callback`);
      const started = await start.json() as { url: string };
      const state = new URL(started.url).searchParams.get('state');
      const cookies = cookieHeader(start);

      const denied = await app.request(`/api/auth/callback/google?error=access_denied&error_description=The%20user%20denied%20the%20request&state=${state}`, {
        headers: { Cookie: cookies, Origin: origin },
        redirect: 'manual',
      });
      expect(denied.status).toBe(302);
      const deniedLocation = denied.headers.get('location') ?? '';
      expect(deniedLocation).toContain(`${origin}/login`);
      expect(deniedLocation).toContain('error=access_denied');
      expect(deniedLocation).toContain('error_description=');

      const mismatch = await app.request('/api/auth/callback/google?code=google-code&state=not-the-issued-state', {
        headers: { Cookie: cookies, Origin: origin },
        redirect: 'manual',
      });
      expect(mismatch.status).toBe(302);
      expect(mismatch.headers.get('location')).toContain('error=state_mismatch');

      const again = await startGoogle(app, `${origin}/auth/callback`);
      const againBody = await again.json() as { url: string };
      const againState = new URL(againBody.url).searchParams.get('state');
      const originalFetch = globalThis.fetch;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith('https://oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }
        return originalFetch(input, init);
      });
      const invalid = await app.request(`/api/auth/callback/google?code=bad-code&state=${againState}`, {
        headers: { Cookie: cookieHeader(again), Origin: origin },
        redirect: 'manual',
      });
      expect(invalid.status).toBe(302);
      expect(invalid.headers.get('location')).toContain('error=invalid_code');
    });
  });
});
