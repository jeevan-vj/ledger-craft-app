import { errorEnvelopeSchema, itemListResponseSchema, itemSchema } from '@ledgercraft/contracts';
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

describe('item routes', () => {
  it('unauthenticated GET /api/items returns 401', async () => {
    const response = await createApp().request('/api/items');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('creates and lists items for the session organisation only', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const created = await app.request('/api/items', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            name: 'Brand identity',
            type: 'service',
            salePrice: '4500',
            taxRate: '15',
            enableSaleInfo: true,
          }),
        });
        expect(created.status).toBe(201);
        const item = itemSchema.parse(await created.json());
        expect(item.name).toBe('Brand identity');
        expect(item.isActive).toBe(true);

        const categoryResponse = await app.request('/api/item-categories', {
          method: 'POST', headers: { ...originHeaders, Cookie: ownerB.cookie },
          body: JSON.stringify({ name: 'Private category' }),
        });
        expect(categoryResponse.status).toBe(201);
        const category = await categoryResponse.json() as { id: string };
        const foreignCreate = await app.request('/api/items', {
          method: 'POST', headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ name: 'Invalid category link', type: 'service', categoryId: category.id }),
        });
        expect(foreignCreate.status).toBe(400);
        const foreignUpdate = await app.request(`/api/items/${item.id}`, {
          method: 'PATCH', headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ categoryId: category.id }),
        });
        expect(foreignUpdate.status).toBe(400);

        const ownCategoryResponse = await app.request('/api/item-categories', {
          method: 'POST', headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ name: 'Services', color: '#5B72EE' }),
        });
        const ownCategory = await ownCategoryResponse.json() as { id: string };
        const categorizedResponse = await app.request(`/api/items/${item.id}`, {
          method: 'PATCH', headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ categoryId: ownCategory.id }),
        });
        expect(categorizedResponse.status).toBe(200);

        const duplicate = await app.request(`/api/items/${item.id}/duplicate`, {
          method: 'POST', headers: { ...originHeaders, Cookie: ownerA.cookie }, body: '{}',
        });
        expect(duplicate.status).toBe(201);
        expect(itemSchema.parse(await duplicate.json()).name).toBe('Brand identity (copy)');

        const bulk = await app.request('/api/items/bulk', {
          method: 'POST', headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ action: 'deactivate', ids: [item.id] }),
        });
        expect(bulk.status).toBe(200);

        const listA = itemListResponseSchema.parse(
          await (await app.request('/api/items', { headers: { Cookie: ownerA.cookie } })).json(),
        );
        expect(listA.items.map((row) => row.name)).toEqual(['Brand identity', 'Brand identity (copy)']);
        expect(listA.items.find((row) => row.id === item.id)?.category?.name).toBe('Services');
        expect(listA.items.find((row) => row.id === item.id)?.isActive).toBe(false);

        const listB = itemListResponseSchema.parse(
          await (await app.request('/api/items', { headers: { Cookie: ownerB.cookie } })).json(),
        );
        expect(listB.items).toEqual([]);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('validates item money and supports category lifecycle plus import preview/apply', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Catalogue Owner');
        const bad = await app.request('/api/items', {
          method: 'POST', headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Bad', type: 'product', salePrice: '-1', taxRate: '101' }),
        });
        expect(bad.status).toBe(400);

        const categoryResponse = await app.request('/api/item-categories', {
          method: 'POST', headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Goods' }),
        });
        const category = await categoryResponse.json() as { id: string };
        const updatedCategory = await app.request(`/api/item-categories/${category.id}`, {
          method: 'PATCH', headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Products', isActive: false }),
        });
        expect(updatedCategory.status).toBe(200);

        const preview = await app.request('/api/items/import', {
          method: 'POST', headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ dryRun: true, rows: [{ name: 'Imported service', type: 'service', salePrice: '90', taxRate: '15' }] }),
        });
        expect(preview.status).toBe(200);
        expect((await preview.json() as { imported: number }).imported).toBe(0);

        const applied = await app.request('/api/items/import', {
          method: 'POST', headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ dryRun: false, rows: [{ name: 'Imported service', type: 'service', salePrice: '90', taxRate: '15' }] }),
        });
        expect(applied.status).toBe(200);
        expect((await applied.json() as { imported: number }).imported).toBe(1);

        await app.request('/api/items', {
          method: 'POST', headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ name: '=HYPERLINK("https://example.test")', type: 'service' }),
        });
        const exported = await app.request('/api/items/export', { headers: { Cookie: owner.cookie } });
        expect(await exported.text()).toContain("'=HYPERLINK");

        const deletedCategory = await app.request(`/api/item-categories/${category.id}`, {
          method: 'DELETE', headers: { Cookie: owner.cookie },
        });
        expect(deletedCategory.status).toBe(204);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
