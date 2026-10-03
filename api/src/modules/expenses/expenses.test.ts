import {
  errorEnvelopeSchema,
  expenseCategorySchema,
  expenseListResponseSchema,
  expenseSchema,
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
  return { cookie: cookieHeader(response) };
}

describe('expense routes', () => {
  it('unauthenticated GET /api/expenses returns 401', async () => {
    const response = await createApp().request('/api/expenses');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('creates and lists expenses for the session organisation only', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const category = await app.request('/api/expense-categories', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ name: 'Software', color: '#5B72EE' }),
        });
        expect(category.status).toBe(201);
        const categoryDto = expenseCategorySchema.parse(await category.json());

        const created = await app.request('/api/expenses', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            description: 'Adobe CC',
            amount: '79.00',
            taxAmount: '10.30',
            expenseDate: '2026-09-08',
            categoryId: categoryDto.id,
            paymentMethod: 'card',
            vendorName: 'Adobe',
            gstTreatment: 'partial',
            gstExemptionReason: 'entertainment_50',
            gstClaimablePercentage: 50,
            privateUsePercentage: 10,
          }),
        });
        expect(created.status).toBe(201);
        const expense = expenseSchema.parse(await created.json());
        expect(expense.amount).toBe('79.00');
        expect(expense.categoryName).toBe('Software');
        expect(expense).toMatchObject({
          gstTreatment: 'partial',
          gstExemptionReason: 'entertainment_50',
          gstClaimablePercentage: 50,
          privateUsePercentage: 10,
        });

        const updated = await app.request(`/api/expenses/${expense.id}`, {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            description: 'Adobe CC updated',
            status: 'approved',
            gstTreatment: 'private_use',
            gstExemptionReason: 'motor_vehicle',
            gstClaimablePercentage: 80,
            privateUsePercentage: 25,
          }),
        });
        expect(updated.status).toBe(200);
        expect(expenseSchema.parse(await updated.json())).toMatchObject({
          description: 'Adobe CC updated',
          status: 'approved',
          gstTreatment: 'private_use',
          gstExemptionReason: 'motor_vehicle',
          gstClaimablePercentage: 80,
          privateUsePercentage: 25,
        });

        const ownership = await app.request('/api/expenses', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            description: 'Sneaky',
            amount: '10.00',
            expenseDate: '2026-09-08',
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const listA = expenseListResponseSchema.parse(
          await (await app.request('/api/expenses', { headers: { Cookie: ownerA.cookie } })).json(),
        );
        expect(listA.expenses.map((row) => row.description)).toEqual(['Adobe CC updated']);

        const listB = expenseListResponseSchema.parse(
          await (await app.request('/api/expenses', { headers: { Cookie: ownerB.cookie } })).json(),
        );
        expect(listB.expenses).toEqual([]);

        const leaked = await app.request(`/api/expenses/${expense.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(leaked.status).toBe(404);

        const foreignCategory = await app.request('/api/expenses', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerB.cookie },
          body: JSON.stringify({
            description: 'Stolen category',
            amount: '5.00',
            expenseDate: '2026-09-08',
            categoryId: categoryDto.id,
          }),
        });
        expect(foreignCategory.status).toBe(400);

        const foreignDelete = await app.request(`/api/expenses/${expense.id}`, {
          method: 'DELETE',
          headers: { Cookie: ownerB.cookie },
        });
        expect(foreignDelete.status).toBe(404);

        const deleted = await app.request(`/api/expenses/${expense.id}`, {
          method: 'DELETE',
          headers: { Cookie: ownerA.cookie },
        });
        expect(deleted.status).toBe(204);
        const afterDelete = expenseListResponseSchema.parse(
          await (await app.request('/api/expenses', { headers: { Cookie: ownerA.cookie } })).json(),
        );
        expect(afterDelete.expenses).toEqual([]);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
