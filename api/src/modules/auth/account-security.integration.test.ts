import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth, type AuthEmail } from './auth';
import { eq } from 'drizzle-orm';
import { verifications } from '../../db/schema/identity';

const origin = 'http://localhost:8080';
let clientIp = '203.0.113.10';

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

function jsonHeaders(extra: Record<string, string> = {}) {
  return { 'Content-Type': 'application/json', Origin: origin, 'X-Forwarded-For': clientIp, ...extra };
}

describe('account recovery and session security', () => {
  it('uses a neutral reset response, rejects unsafe redirects, consumes the token once, and revokes old cookie and bearer sessions', async () => {
    clientIp = '203.0.113.11';
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      const sent: AuthEmail[] = [];
      try {
        const auth = createAuth(db, { sendAuthEmail: async (email) => { sent.push(email); }, enableRateLimit: true });
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const email = `recovery-${crypto.randomUUID()}@example.com`;
        const password = 'password123';
        const signUp = await app.request('/api/auth/sign-up/email', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name: 'Recovery owner', email, password }),
        });
        expect(signUp.status).toBe(200);
        const cookie = cookieHeader(signUp);
        const bearer = signUp.headers.get('set-auth-token');
        expect(bearer).toBeTruthy();

        sent.length = 0;
        const known = await app.request('/api/auth/request-password-reset', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, redirectTo: `${origin}/reset-password` }),
        });
        const unknown = await app.request('/api/auth/request-password-reset', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: `unknown-${crypto.randomUUID()}@example.com`, redirectTo: `${origin}/reset-password` }),
        });
        expect(known.status).toBe(200);
        expect(unknown.status).toBe(200);
        expect(await unknown.json()).toEqual(await known.json());
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ kind: 'password-reset', to: email });
        expect(sent[0]?.url).not.toContain(email);

        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const unsafe = await app.request('/api/auth/request-password-reset', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, redirectTo: 'https://attacker.example/reset?token=logger-secret' }),
        });
        expect(unsafe.status).toBe(403);
        expect(sent).toHaveLength(1);
        expect(errorLog.mock.calls.flat().join(' ')).not.toContain('logger-secret');
        errorLog.mockRestore();

        const token = new URL(sent[0]!.url).pathname.split('/').pop();
        expect(token).toBeTruthy();
        clientIp = '203.0.113.111';
        await app.request('/api/auth/request-password-reset', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, redirectTo: `${origin}/reset-password` }),
        });
        const expiredToken = new URL(sent[1]!.url).pathname.split('/').pop()!;
        await db.update(verifications).set({ expiresAt: new Date(0) }).where(eq(verifications.identifier, `reset-password:${expiredToken}`));
        const expired = await app.request('/api/auth/reset-password', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ token: expiredToken, newPassword: 'expired-password123' }),
        });
        expect(expired.status).toBe(400);
        const reset = await app.request('/api/auth/reset-password', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ token, newPassword: 'new-password123' }),
        });
        expect(reset.status).toBe(200);
        expect(await reset.json()).toEqual({ status: true });
        const replay = await app.request('/api/auth/reset-password', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ token, newPassword: 'another-password123' }),
        });
        expect(replay.status).toBe(400);
        expect((await app.request('/api/me', { headers: { Cookie: cookie, Origin: origin } })).status).toBe(401);
        expect((await app.request('/api/me', { headers: { Authorization: `Bearer ${bearer}`, Origin: origin } })).status).toBe(401);
        expect((await app.request('/api/auth/sign-in/email', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, password: 'new-password123' }),
        })).status).toBe(200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('lists sessions, revokes other sessions while keeping the current one, and changes password with the same explicit behavior', async () => {
    clientIp = '203.0.113.12';
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db, { sendAuthEmail: async () => undefined, enableRateLimit: true });
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const email = `sessions-${crypto.randomUUID()}@example.com`;
        const signUp = await app.request('/api/auth/sign-up/email', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name: 'Session owner', email, password: 'password123' }),
        });
        const currentCookie = cookieHeader(signUp);
        const second = await app.request('/api/auth/sign-in/email', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, password: 'password123' }),
        });
        const secondCookie = cookieHeader(second);
        const currentHeaders = jsonHeaders({ Cookie: currentCookie });
        const sessions = await app.request('/api/me/sessions', { headers: currentHeaders });
        expect(sessions.status).toBe(200);
        const sessionList = await sessions.json() as Array<{ current: boolean }>;
        expect(sessionList).toHaveLength(2);
        expect(sessionList.filter((session) => session.current)).toHaveLength(1);

        const revokeOthers = await app.request('/api/me/sessions/revoke-others', {
          method: 'POST', headers: currentHeaders, body: '{}',
        });
        expect(revokeOthers.status).toBe(200);
        expect((await app.request('/api/me', { headers: { Cookie: currentCookie, Origin: origin } })).status).toBe(200);
        expect((await app.request('/api/me', { headers: { Cookie: secondCookie, Origin: origin } })).status).toBe(401);

        const third = await app.request('/api/auth/sign-in/email', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, password: 'password123' }),
        });
        const thirdCookie = cookieHeader(third);
        const changed = await app.request('/api/auth/change-password', {
          method: 'POST', headers: currentHeaders,
          body: JSON.stringify({ currentPassword: 'password123', newPassword: 'changed-password123', revokeOtherSessions: true }),
        });
        expect(changed.status).toBe(200);
        const replacementCookie = cookieHeader(changed);
        expect(replacementCookie).toContain('better-auth.session_token=');
        expect((await app.request('/api/me', { headers: { Cookie: currentCookie, Origin: origin } })).status).toBe(401);
        expect((await app.request('/api/me', { headers: { Cookie: thirdCookie, Origin: origin } })).status).toBe(401);
        expect((await app.request('/api/me', { headers: { Cookie: replacementCookie, Origin: origin } })).status).toBe(200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('keeps the old address active until the new address is verified', async () => {
    clientIp = '203.0.113.13';
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      const sent: AuthEmail[] = [];
      try {
        const auth = createAuth(db, { sendAuthEmail: async (email) => { sent.push(email); }, enableRateLimit: true });
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const email = `old-${crypto.randomUUID()}@example.com`;
        const newEmail = `new-${crypto.randomUUID()}@example.com`;
        const signUp = await app.request('/api/auth/sign-up/email', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name: 'Email owner', email, password: 'password123' }),
        });
        sent.length = 0;
        const cookie = cookieHeader(signUp);
        const changed = await app.request('/api/auth/change-email', {
          method: 'POST', headers: jsonHeaders({ Cookie: cookie }), body: JSON.stringify({ newEmail, callbackURL: `${origin}/settings?tab=security` }),
        });
        expect(changed.status).toBe(200);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ kind: 'email-verification', to: newEmail });
        const before = await app.request('/api/me', { headers: { Cookie: cookie, Origin: origin } });
        expect((await before.json() as { user: { email: string } }).user.email).toBe(email);
        const verificationUrl = new URL(sent[0]!.url);
        const verified = await app.request(`${verificationUrl.pathname}${verificationUrl.search}`, { headers: { Origin: origin }, redirect: 'manual' });
        expect(verified.status).toBe(302);
        const afterSignIn = await app.request('/api/auth/sign-in/email', {
          method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email: newEmail, password: 'password123' }),
        });
        expect(afterSignIn.status).toBe(200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('rate limits reset requests independently of organisation membership', async () => {
    clientIp = '203.0.113.14';
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      const sent: AuthEmail[] = [];
      try {
        const auth = createAuth(db, { sendAuthEmail: async (email) => { sent.push(email); }, enableRateLimit: true });
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const email = `limited-${crypto.randomUUID()}@example.com`;
        await app.request('/api/auth/sign-up/email', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name: 'Limited owner', email, password: 'password123' }) });
        sent.length = 0;
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 4; attempt += 1) {
          statuses.push((await app.request('/api/auth/request-password-reset', {
            method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email, redirectTo: `${origin}/reset-password` }),
          })).status);
        }
        expect(statuses).toEqual([200, 200, 200, 429]);
        expect(sent).toHaveLength(3);
      } finally { await sql.end({ timeout: 5 }); }
    });
  });
});
