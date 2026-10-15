import { errorEnvelopeSchema, objectSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createMemoryObjectStore } from './object-store';

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

const originHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

describe('object routes', () => {
  it('unauthenticated GET/POST /api/objects return 401', async () => {
    const get = await createApp().request('/api/objects?key=x');
    expect(get.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await get.json()).error.code).toBe('UNAUTHORIZED');
    const post = await createApp().request('/api/objects', {
      method: 'POST',
      headers: originHeaders,
      body: JSON.stringify({
        kind: 'receipt',
        filename: 'r.png',
        contentType: 'image/png',
        contentBase64: PNG_B64,
      }),
    });
    expect(post.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await post.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('stores bytes, returns them, and hides them from other orgs', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const objectStore = createMemoryObjectStore();
        const app = createApp({ auth, db, checkDatabase: async () => true, objectStore });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const ownership = await app.request('/api/objects', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            kind: 'receipt',
            filename: 'r.png',
            contentType: 'image/png',
            contentBase64: PNG_B64,
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const uploaded = await app.request('/api/objects', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            kind: 'receipt',
            filename: 'r.png',
            contentType: 'image/png',
            contentBase64: PNG_B64,
          }),
        });
        expect(uploaded.status).toBe(201);
        const dto = objectSchema.parse(await uploaded.json());
        expect(dto.kind).toBe('receipt');
        expect(dto.contentType).toBe('image/png');
        expect(dto.size).toBeGreaterThan(0);

        const downloaded = await app.request(dto.url, { headers: { Cookie: ownerA.cookie } });
        expect(downloaded.status).toBe(200);
        expect(downloaded.headers.get('content-type')).toBe('image/png');
        const bytes = new Uint8Array(await downloaded.arrayBuffer());
        expect(Buffer.from(bytes).toString('base64')).toBe(PNG_B64);

        const hidden = await app.request(dto.url, { headers: { Cookie: ownerB.cookie } });
        expect(hidden.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await hidden.json()).error.code).toBe('NOT_FOUND');
      } finally {
        await sql.end();
      }
    });
  });
});
