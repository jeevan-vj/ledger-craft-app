import { createSign, generateKeyPairSync } from 'node:crypto';
import { meResponseSchema } from '@ledgercraft/contracts';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { authAccounts, organisationMemberships, organisations, users, verifications } from '../../db/schema/identity';
import { getDatabaseUrl, syncGoogleAuthEnv } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth, type AuthEmail } from './auth';
import { sha256Base64Url } from './google';
import { clearGoogleJwksCache } from './google-id-token';

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

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const googleJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

function googleIdToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT', kid: 'test-key' });
  const payload = encode({
    aud: 'test-google-client',
    azp: 'test-google-client',
    iss: 'https://accounts.google.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  });
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
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
  clearGoogleJwksCache();
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
    if (url.startsWith('https://www.googleapis.com/oauth2/v3/certs')) {
      return new Response(JSON.stringify({ keys: [googleJwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
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
        expect(redirect.searchParams.get('code_challenge_method')).toBe('S256');
        expect(redirect.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]+$/);
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
      const signUp = await signUpPassword(app, email);
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
      expect(accounts.map((account) => account.providerId)).toEqual(['google']);
      expect(await db.select().from(organisations)).toHaveLength(organisationCount.length);

      const oldSession = await app.request('/api/me', { headers: { Cookie: cookieHeader(signUp), Origin: origin } });
      expect(oldSession.status).toBe(401);
      const oldPassword = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email, password: 'password123' }),
      });
      expect(oldPassword.status).toBe(401);

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

  it('provisions an organisation for a new verified Google user and exchanges a one-time mobile code', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app, db) => {
      const email = `new-${crypto.randomUUID()}@example.com`;
      const mobileState = 'mobile-state-1';
      const verifier = 'mobile-verifier-1';
      const start = await app.request('/api/auth/sign-in/social', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          provider: 'google',
          callbackURL: `easybizinvoice://auth/google?state=${mobileState}`,
          errorCallbackURL: `easybizinvoice://auth/google?state=${mobileState}`,
          disableRedirect: true,
          additionalData: { verifierHash: await sha256Base64Url(verifier) },
        }),
      });
      expect(start.status).toBe(200);
      const callback = await finishGoogle(app, start, {
        sub: 'google-subject-new',
        email,
        email_verified: true,
        name: 'New Google',
      });
      expect(callback.status).toBe(302);
      const location = new URL(callback.headers.get('location') ?? '');
      expect(`${location.protocol}//${location.host}${location.pathname}`).toBe('easybizinvoice://auth/google');
      expect(location.searchParams.get('state')).toBe(mobileState);
      const code = location.searchParams.get('code');
      expect(code).toBeTruthy();
      expect(location.searchParams.get('cookie')).toBeNull();
      expect(callback.headers.get('location')).not.toContain('session_token');
      expect(callback.headers.get('set-auth-token')).toBeNull();
      expect(callback.headers.get('set-cookie') ?? '').not.toContain('session_token');

      const wrongState = await app.request('/api/auth/google/mobile-session', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ code, state: 'other-state', verifier }),
      });
      expect(wrongState.status).toBe(401);
      expect(cookieHeader(wrongState)).not.toContain('session_token');
      const wrongVerifier = await app.request('/api/auth/google/mobile-session', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ code, state: mobileState, verifier: 'not-the-verifier' }),
      });
      expect(wrongVerifier.status).toBe(401);
      expect(cookieHeader(wrongVerifier)).not.toContain('session_token');
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      let exchanged: Response;
      try {
        exchanged = await app.request('/api/auth/google/mobile-session', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ code, state: mobileState, verifier }),
        });
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
      }
      expect(exchanged.status).toBe(200);
      expect(cookieHeader(exchanged)).toContain('session_token=');
      expect(exchanged.headers.get('set-cookie') ?? '').toContain('Secure');
      const replay = await app.request('/api/auth/google/mobile-session', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ code, state: mobileState, verifier }),
      });
      expect(replay.status).toBe(401);

      const [user] = await db.select().from(users).where(eq(users.email, email));
      expect(user?.name).toBe('New Google');
      const [membership] = await db.select().from(organisationMemberships).where(eq(organisationMemberships.userId, user!.id));
      const [organisation] = await db.select().from(organisations).where(eq(organisations.id, membership!.organisationId));
      expect(organisation?.name).toBe("New Google's organisation");
      expect(membership?.role).toBe('owner');
      const me = await app.request('/api/me', { headers: { Cookie: cookieHeader(exchanged), Origin: origin } });
      expect(me.status).toBe(200);
    });
  });

  it('keeps access_denied and the mobile state when Google returns an error', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app) => {
      const mobileState = 'mobile-state-denied';
      const start = await app.request('/api/auth/sign-in/social', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          provider: 'google',
          callbackURL: `easybizinvoice://auth/google?state=${mobileState}`,
          errorCallbackURL: `easybizinvoice://auth/google?state=${mobileState}`,
          disableRedirect: true,
          additionalData: { verifierHash: await sha256Base64Url('verifier') },
        }),
      });
      const started = await start.json() as { url: string };
      const oauthState = new URL(started.url).searchParams.get('state');
      const denied = await app.request(`/api/auth/callback/google?error=access_denied&error_description=The%20user%20denied%20the%20request&state=${oauthState}`, {
        headers: { Cookie: cookieHeader(start), Origin: origin },
        redirect: 'manual',
      });
      const location = new URL(denied.headers.get('location') ?? '');
      expect(location.searchParams.get('error')).toBe('access_denied');
      expect(location.searchParams.get('state')).toBe(mobileState);
      expect(denied.headers.get('location')).not.toContain('session_token');
      expect(denied.headers.get('set-cookie') ?? '').not.toContain('session_token');
    });
  });

  it('rejects an expired mobile sign-in code', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app, db) => {
      const mobileState = 'mobile-state-expired';
      const verifier = 'mobile-verifier-expired';
      const start = await app.request('/api/auth/sign-in/social', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          provider: 'google',
          callbackURL: `easybizinvoice://auth/google?state=${mobileState}`,
          errorCallbackURL: `easybizinvoice://auth/google?state=${mobileState}`,
          disableRedirect: true,
          additionalData: { verifierHash: await sha256Base64Url(verifier) },
        }),
      });
      const callback = await finishGoogle(app, start, {
        sub: 'google-subject-expired',
        email: `expired-${crypto.randomUUID()}@example.com`,
        email_verified: true,
        name: 'Expired Code',
      });
      const code = new URL(callback.headers.get('location') ?? '').searchParams.get('code');
      expect(code).toBeTruthy();
      await db.update(verifications).set({ expiresAt: new Date(0) }).where(eq(verifications.identifier, `google-mobile-code:${code}`));
      const expired = await app.request('/api/auth/google/mobile-session', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ code, state: mobileState, verifier }),
      });
      expect(expired.status).toBe(401);
      expect(cookieHeader(expired)).not.toContain('session_token');
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

  it('keeps the password when the local email is already verified', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app, db) => {
      const email = `verified-${crypto.randomUUID()}@example.com`;
      const signUp = await signUpPassword(app, email);
      const [before] = await db.select().from(users).where(eq(users.email, email));
      await db.update(users).set({ emailVerified: true }).where(eq(users.id, before!.id));
      const callback = await finishGoogle(app, await startGoogle(app, `${origin}/auth/callback`), {
        sub: 'google-subject-verified',
        email,
        email_verified: true,
        name: 'Password Owner',
      });
      const accounts = await db.select().from(authAccounts).where(eq(authAccounts.userId, before!.id));
      expect(accounts.map((account) => account.providerId).sort()).toEqual(['credential', 'google']);
      expect((await app.request('/api/me', { headers: { Cookie: cookieHeader(signUp), Origin: origin } })).status).toBe(200);
      expect((await app.request('/api/auth/sign-in/email', {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, password: 'password123' }),
      })).status).toBe(200);
      expect((await app.request('/api/me', { headers: { Cookie: cookieHeader(callback), Origin: origin } })).status).toBe(200);
    });
  });

  it('rejects an untrusted callback and an open browser redirect, and disables Google when one secret is missing', async () => {
    useGoogleCredentials(true);
    await withAuthApp(async (app) => {
      const evil = await app.request('/api/auth/sign-in/social', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          provider: 'google',
          callbackURL: 'https://evil.example/steal',
          errorCallbackURL: 'https://evil.example/steal',
          newUserCallbackURL: 'https://evil.example/steal',
          disableRedirect: true,
        }),
      });
      expect(evil.status).toBe(403);
      const proxy = await app.request(`/api/auth/google/browser?authorizationURL=${encodeURIComponent('https://evil.example/?state=1')}`, { redirect: 'manual' });
      expect(proxy.status).toBe(400);
      expect(proxy.headers.get('location') ?? '').not.toContain('evil.example');
    });

    for (const partial of [
      { GOOGLE_CLIENT_ID: 'only-id', GOOGLE_CLIENT_SECRET: undefined },
      { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: 'only-secret' },
    ]) {
      if (partial.GOOGLE_CLIENT_ID) process.env.GOOGLE_CLIENT_ID = partial.GOOGLE_CLIENT_ID;
      else delete process.env.GOOGLE_CLIENT_ID;
      if (partial.GOOGLE_CLIENT_SECRET) process.env.GOOGLE_CLIENT_SECRET = partial.GOOGLE_CLIENT_SECRET;
      else delete process.env.GOOGLE_CLIENT_SECRET;
      await withAuthApp(async (partialApp) => {
        expect(await (await partialApp.request('/api/auth/providers')).json()).toEqual({ google: false });
        const blocked = await partialApp.request(`/api/auth/google/browser?authorizationURL=${encodeURIComponent('https://accounts.google.com/o/oauth2/v2/auth?state=1')}`, { redirect: 'manual' });
        expect(blocked.status).toBe(404);
      });
    }
  });

  it('drops Google after the Worker secrets are removed and rate limits the browser handoff', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
    syncGoogleAuthEnv({ GOOGLE_CLIENT_ID: 'test-google-client', GOOGLE_CLIENT_SECRET: 'test-google-secret' });
    await withAuthApp(async (enabled) => {
      expect(await (await enabled.request('/api/auth/providers')).json()).toEqual({ google: true });
    });
    syncGoogleAuthEnv({});
    await withAuthApp(async (disabled) => {
      expect(await (await disabled.request('/api/auth/providers')).json()).toEqual({ google: false });
    });

    useGoogleCredentials(true);
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db, { enableRateLimit: true }), db, checkDatabase: async () => true });
        const redirect = encodeURIComponent('http://localhost:8080/api/auth/callback/google');
        const authorization = `https://accounts.google.com/o/oauth2/v2/auth?client_id=test-google-client&redirect_uri=${redirect}&state=abc&response_type=code`;
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 21; attempt += 1) {
          const response = await app.request(`/api/auth/google/browser?authorizationURL=${encodeURIComponent(authorization)}`, {
            headers: { Origin: origin, 'X-Forwarded-For': '203.0.113.77' },
            redirect: 'manual',
          });
          statuses.push(response.status);
        }
        expect(statuses.slice(0, 20).every((status) => status === 302)).toBe(true);
        expect(statuses[20]).toBe(429);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('lets a Google-only user set a password, delete the account, and leave another public invoice', async () => {
    useGoogleCredentials(true);
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      const sent: AuthEmail[] = [];
      try {
        const auth = createAuth(db, { sendAuthEmail: async (email) => { sent.push(email); } });
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const seller = await signUpPassword(app, `seller-${crypto.randomUUID()}@example.com`);
        const sellerHeaders = jsonHeaders({ Cookie: cookieHeader(seller) });
        expect((await app.request('/api/business-profile', {
          method: 'PUT', headers: sellerHeaders,
          body: JSON.stringify({ name: 'Market Stall', email: 'stall@example.test', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2020-01-01', gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3 }),
        })).status).toBe(200);
        const sale = await app.request('/api/sales', {
          method: 'POST', headers: { ...sellerHeaders, 'Idempotency-Key': 'google-delete-sale' },
          body: JSON.stringify({ lines: [{ label: 'Pie', quantity: '1', price: '4.50' }], paymentMethod: 'cash' }),
        });
        expect(sale.status).toBe(201);
        const invoiceId = (await sale.json() as { invoice: { id: string } }).invoice.id;
        const shared = await app.request(`/api/invoices/${invoiceId}/share`, {
          method: 'POST', headers: sellerHeaders, body: JSON.stringify({ templateName: 'classic' }),
        });
        expect(shared.status).toBe(201);
        const shareToken = (await shared.json() as { shareToken: string }).shareToken;

        const email = `google-only-${crypto.randomUUID()}@example.com`;
        const callback = await finishGoogle(app, await startGoogle(app, `${origin}/auth/callback`), {
          sub: 'google-subject-delete', email, email_verified: true, name: 'Google Only',
        });
        const googleCookie = cookieHeader(callback);
        const pending = `pending-${crypto.randomUUID()}@example.com`;
        const changed = await app.request('/api/auth/change-email', {
          method: 'POST', headers: jsonHeaders({ Cookie: googleCookie }),
          body: JSON.stringify({ newEmail: pending, callbackURL: `${origin}/settings` }),
        });
        expect(changed.status).toBe(200);
        expect((await app.request('/api/me', { headers: { Cookie: googleCookie, Origin: origin } })).status).toBe(200);
        const [original] = await db.select().from(users).where(eq(users.email, email));
        await finishGoogle(app, await startGoogle(app, `${origin}/auth/callback`), {
          sub: 'google-subject-pending', email: pending, email_verified: true, name: 'Pending',
        });
        const stillOriginal = await db.select().from(users).where(eq(users.email, email));
        expect(stillOriginal.map((user) => user.id)).toEqual([original?.id]);
        const pendingUser = await db.select().from(users).where(eq(users.email, pending));
        expect(pendingUser.every((user) => user.id !== original?.id)).toBe(true);

        sent.length = 0;
        expect((await app.request('/api/auth/request-password-reset', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, redirectTo: `${origin}/reset-password` }),
        })).status).toBe(200);
        const token = new URL(sent[0]!.url).pathname.split('/').pop();
        expect((await app.request('/api/auth/reset-password', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ token, newPassword: 'reset-password123' }),
        })).status).toBe(200);
        expect((await app.request('/api/me', { headers: { Cookie: googleCookie, Origin: origin } })).status).toBe(401);
        const passwordSession = await app.request('/api/auth/sign-in/email', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, password: 'reset-password123' }),
        });
        expect(passwordSession.status).toBe(200);
        const deleted = await app.request('/api/me', {
          method: 'DELETE', headers: jsonHeaders({ Cookie: cookieHeader(passwordSession) }),
          body: JSON.stringify({ password: 'reset-password123', confirmation: 'DELETE' }),
        });
        expect(deleted.status).toBe(200);
        expect((await app.request('/api/me', { headers: { Cookie: cookieHeader(passwordSession), Origin: origin } })).status).toBe(401);
        expect((await app.request(`/api/public/invoices/${shareToken}`)).status).toBe(200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
