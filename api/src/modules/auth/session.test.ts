import { errorEnvelopeSchema, meResponseSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from './auth';

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('session routes', () => {
  it('unauthenticated GET /api/me returns 401 with the error envelope', async () => {
    const response = await createApp().request('/api/me');
    expect(response.status).toBe(401);
    const body = errorEnvelopeSchema.parse(await response.json());
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBeTruthy();
    expect(body.error.requestId).toMatch(/^req_/);
  });

  it('session plus membership binds organisation_id inside the use-case transaction', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const email = `owner-${crypto.randomUUID()}@example.com`;

        const signUp = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:8080',
          },
          body: JSON.stringify({
            name: 'W3 Owner',
            email,
            password: 'password123',
          }),
        });
        expect(signUp.status).toBeLessThan(400);

        const token = signUp.headers.get('set-auth-token');
        expect(token).toBeTruthy();

        const me = await app.request('/api/me', {
          headers: {
            Cookie: cookieHeader(signUp),
            Origin: 'http://localhost:8080',
          },
        });
        expect(me.status).toBe(200);
        const body = meResponseSchema.parse(await me.json());
        expect(body.user.email).toBe(email);
        expect(body.user.name).toBe('W3 Owner');
        expect(body.membership.role).toBe('owner');
        expect(body.organisation.name.length).toBeGreaterThan(0);

        const signIn = await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:8080',
          },
          body: JSON.stringify({ email, password: 'password123' }),
        });
        expect(signIn.status).toBe(200);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('sign-out with a JSON content type needs a JSON body and then revokes the session', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const email = `signout-${crypto.randomUUID()}@example.com`;

        const signUp = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:8080',
          },
          body: JSON.stringify({ name: 'Sign Out', email, password: 'password123' }),
        });
        expect(signUp.status).toBeLessThan(400);
        const sessionHeaders = {
          'Content-Type': 'application/json',
          Cookie: cookieHeader(signUp),
          Origin: 'http://localhost:8080',
        };

        // What the mobile app used to send: JSON content type with an empty body. Over the wire
        // (Content-Length: 0) the server sees an empty, non-null body, so model it with ''.
        const emptyBody = await app.request('/api/auth/sign-out', {
          method: 'POST',
          headers: sessionHeaders,
          body: '',
        });
        expect(emptyBody.status).toBe(400);
        const stillSignedIn = await app.request('/api/me', { headers: sessionHeaders });
        expect(stillSignedIn.status).toBe(200);

        // What the mobile app sends now.
        const signOut = await app.request('/api/auth/sign-out', {
          method: 'POST',
          headers: sessionHeaders,
          body: '{}',
        });
        expect(signOut.status).toBe(200);
        expect(await signOut.json()).toEqual({ success: true });

        // The old cookie must no longer work, because the server session was revoked.
        const afterSignOut = await app.request('/api/me', {
          headers: { Cookie: sessionHeaders.Cookie, Origin: 'http://localhost:8080' },
        });
        expect(afterSignOut.status).toBe(401);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('does not point Vitest at the app database', () => {
    expect(new URL(getDatabaseUrl()).pathname).toMatch(/ledgercraft-sqlite-test-[^/]+\/ledgercraft_test\.sqlite$/);
  });
});
