import {
  createCustomerRequestSchema,
  customerListResponseSchema,
  customerSchema,
  errorEnvelopeSchema,
} from '@ledgercraft/contracts';
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

describe('customer routes', () => {
  it('unauthenticated GET /api/customers returns 401 with the error envelope', async () => {
    const response = await createApp().request('/api/customers');
    expect(response.status).toBe(401);
    const body = errorEnvelopeSchema.parse(await response.json());
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('creates and lists customers for the session organisation only', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const created = await app.request('/api/customers', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ name: 'A Ltd', email: 'a@example.com', country: 'NZ' }),
        });
        expect(created.status).toBe(201);
        const customer = customerSchema.parse(await created.json());
        expect(customer.name).toBe('A Ltd');
        expect(customer).not.toHaveProperty('organisationId');
        expect(customer).not.toHaveProperty('userId');

        const listA = customerListResponseSchema.parse(
          await (
            await app.request('/api/customers', { headers: { Cookie: ownerA.cookie } })
          ).json(),
        );
        expect(listA.customers.map((row) => row.name)).toEqual(['A Ltd']);

        const listB = customerListResponseSchema.parse(
          await (
            await app.request('/api/customers', { headers: { Cookie: ownerB.cookie } })
          ).json(),
        );
        expect(listB.customers).toEqual([]);

        const leaked = await app.request(`/api/customers/${customer.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(leaked.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await leaked.json()).error.code).toBe('NOT_FOUND');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('rejects ownership ids in the create body', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner C');
        const forged = {
          name: 'Forged Ltd',
          email: 'forged@example.com',
          organisationId: '11111111-1111-1111-1111-111111111111',
          userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        };
        expect(createCustomerRequestSchema.safeParse(forged).success).toBe(false);

        const response = await app.request('/api/customers', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify(forged),
        });
        expect(response.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
