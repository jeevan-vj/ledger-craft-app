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
  it('requires a settlement account for paid-from instead of crediting revenue, expense or equity', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Expense settlement account');
        const headers = { ...originHeaders, Cookie: owner.cookie };
        for (const type of ['expense', 'revenue', 'equity', 'asset', 'bank', 'cash', 'credit_card', 'loan']) {
          const accountResponse = await app.request('/api/accounts', { method: 'POST', headers, body: JSON.stringify({ name: `${type} account`, type }) });
          expect(accountResponse.status).toBe(201);
          const account = await accountResponse.json() as { id: string };
          const response = await app.request('/api/expenses', { method: 'POST', headers, body: JSON.stringify({ description: 'Paid expense', amount: '230.00', taxAmount: '30.00', expenseDate: '2026-04-15', status: 'approved', accountId: account.id }) });
          expect(response.status, type).toBe(['bank', 'cash', 'credit_card', 'loan'].includes(type) ? 201 : 400);
        }
      } finally { await sql.end(); }
    });
  });
  it.each([
    ['standard', 100, 0, '30.00', '200.00'],
    ['partial', 50, 0, '15.00', '215.00'],
    ['exempt', 100, 0, '0.00', '230.00'],
    ['zero_rated', 100, 0, '0.00', '230.00'],
    ['private_use', 100, 25, '22.50', '207.50'],
    ['partial', 50, 25, '11.25', '218.75'],
  ] as const)('posts only claimable GST for %s at claim %i%% and private use %i%%', async (gstTreatment, gstClaimablePercentage, privateUsePercentage, expectedGst, expectedCost) => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Expense GST claim');
        const headers = { ...originHeaders, Cookie: owner.cookie };
        const response = await app.request('/api/expenses', { method: 'POST', headers, body: JSON.stringify({
          description: 'GST claim evidence', amount: '230.00', taxAmount: '30.00', currency: 'NZD', expenseDate: '2026-04-15', status: 'approved',
          gstTreatment, gstClaimablePercentage, privateUsePercentage,
        }) });
        expect(response.status).toBe(201);
        const expense = expenseSchema.parse(await response.json());
        expect(expense).toMatchObject({ amount: '230.00', taxAmount: '30.00', baseTaxAmount: '30.00' });
        const report = await (await app.request('/api/reports/financial?from=2026-04-01&to=2026-04-30', { headers })).json() as {
          taxSummary: { inputGst: string }; profitLoss: { expenses: string }; cashFlow: { closingCash: string }; trialBalance: { balanced: boolean };
        };
        expect(report.taxSummary.inputGst).toBe(expectedGst);
        expect(report.profitLoss.expenses).toBe(expectedCost);
        expect(report.cashFlow.closingCash).toBe('-230.00');
        expect(report.trialBalance.balanced).toBe(true);
      } finally { await sql.end(); }
    });
  });
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
