import { eq } from 'drizzle-orm';
import { organisationMemberships } from '../../db/schema/identity';
import { createHash } from 'node:crypto';
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
 it('allows receipt-only upload/deletion to an accountant without widening generic object writes', async()=>withTestDb(async()=>{
  const {db,sql}=createDb(getDatabaseUrl());
  try{
   const app=createApp({auth:createAuth(db),db,objectStore:createMemoryObjectStore(),checkDatabase:async()=>true});const owner=await signUp(app,'Receipt accountant');const other=await signUp(app,'Other company');const headers={...originHeaders,Cookie:owner.cookie};
   const profile=await app.request('/api/me',{headers});const me=await profile.json() as {user:{id:string}};
   const logoResponse=await app.request('/api/objects',{method:'POST',headers,body:JSON.stringify({kind:'logo',filename:'logo.png',contentType:'image/png',contentBase64:PNG_B64})});const logo=await logoResponse.json() as {key:string};
   await db.update(organisationMemberships).set({role:'accountant'}).where(eq(organisationMemberships.userId,me.user.id));
   const body={kind:'receipt',filename:'receipt.png',contentType:'image/png',contentBase64:PNG_B64};
   const generic=await app.request('/api/objects',{method:'POST',headers,body:JSON.stringify(body)});expect(generic.status).toBe(403);
   const upload=await app.request('/api/objects/receipts',{method:'POST',headers,body:JSON.stringify(body)});expect(upload.status).toBe(201);const receipt=await upload.json() as {key:string;url:string};
   expect((await app.request(receipt.url,{headers})).status).toBe(200);expect((await app.request(receipt.url,{headers:{Cookie:other.cookie}})).status).toBe(404);
   expect((await app.request('/api/objects/receipts',{method:'POST',headers,body:JSON.stringify({...body,kind:'logo'})})).status).toBe(400);
   expect((await app.request(`/api/objects/receipts?key=${encodeURIComponent(logo.key)}`,{method:'DELETE',headers})).status).toBe(404);
   const saved=await app.request('/api/expenses',{method:'POST',headers,body:JSON.stringify({description:'Retained receipt',amount:'115.00',taxAmount:'15.00',expenseDate:'2026-10-01',receiptUrl:receipt.url})});expect(saved.status).toBe(201);const expense=await saved.json() as {id:string};
   expect.soft((await app.request(`/api/objects/receipts?key=${encodeURIComponent(receipt.key)}`,{method:'DELETE',headers})).status).toBe(409);
   await app.request(`/api/expenses/${expense.id}`,{method:'DELETE',headers});
   expect((await app.request(`/api/objects/receipts?key=${encodeURIComponent(receipt.key)}`,{method:'DELETE',headers})).status).toBe(204);
   await db.update(organisationMemberships).set({role:'read_only'}).where(eq(organisationMemberships.userId,me.user.id));
   expect((await app.request('/api/objects/receipts',{method:'POST',headers,body:JSON.stringify(body)})).status).toBe(403);
  }finally{await sql.end();}
 }));
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
        expect((dto as {sha256?:string}).sha256).toBe(createHash('sha256').update(Buffer.from(PNG_B64,'base64')).digest('hex'));
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
