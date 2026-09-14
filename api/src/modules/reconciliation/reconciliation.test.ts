import {
  bankAccountSchema,
  errorEnvelopeSchema,
  expenseSchema,
  importBankTransactionsResponseSchema,
  reconciliationMatchSchema,
  reconciliationSessionSchema,
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

async function seedBankAccount(app: ReturnType<typeof createApp>, cookie: string) {
  const created = await app.request('/api/bank-accounts', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      accountName: 'Business cheque',
      accountNumber: '12-3456-7890123-00',
      bankName: 'ANZ',
      accountType: 'checking',
      openingBalance: '0.00',
    }),
  });
  expect(created.status).toBe(201);
  return bankAccountSchema.parse(await created.json());
}

describe('reconciliation routes', () => {
  it('unauthenticated GET /api/reconciliation-sessions returns 401', async () => {
    const response = await createApp().request('/api/reconciliation-sessions');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('isolates sessions, rejects foreign book items, and blocks unbalanced complete', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');
        const account = await seedBankAccount(app, ownerA.cookie);

        const expenseRes = await app.request('/api/expenses', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            description: 'Adobe CC',
            amount: '79.00',
            expenseDate: '2026-09-01',
            paymentMethod: 'card',
          }),
        });
        expect(expenseRes.status).toBe(201);
        const expense = expenseSchema.parse(await expenseRes.json());

        const imported = await app.request('/api/bank-transactions/import', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            bankAccountId: account.id,
            transactions: [
              {
                transactionDate: '2026-09-01',
                description: 'Adobe',
                amount: '79.00',
                type: 'debit',
              },
            ],
          }),
        });
        expect(imported.status).toBe(201);
        const bankTx = importBankTransactionsResponseSchema.parse(await imported.json()).transactions[0];
        expect(bankTx).toBeDefined();

        const ownership = await app.request('/api/reconciliation-sessions', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            bankAccountId: account.id,
            statementStartDate: '2026-09-01',
            statementEndDate: '2026-09-30',
            statementOpeningBalance: '0.00',
            statementClosingBalance: '0.00',
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const sessionRes = await app.request('/api/reconciliation-sessions', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            bankAccountId: account.id,
            statementStartDate: '2026-09-01',
            statementEndDate: '2026-09-30',
            statementOpeningBalance: '0.00',
            statementClosingBalance: '0.00',
          }),
        });
        expect(sessionRes.status).toBe(201);
        const session = reconciliationSessionSchema.parse(await sessionRes.json());
        expect(session.bookOpeningBalance).toBe('0.00');

        const leaked = await app.request(`/api/reconciliation-sessions/${session.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(leaked.status).toBe(404);

        const match = await app.request(`/api/reconciliation-sessions/${session.id}/matches`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            bankTransactionId: bankTx!.id,
            bookItemType: 'expense',
            bookItemId: expense.id,
            confidenceScore: 100,
          }),
        });
        expect(match.status).toBe(201);
        const savedMatch = reconciliationMatchSchema.parse(await match.json());
        expect(savedMatch.confidenceScore).toBe(100);
        expect(savedMatch.expenseId).toBe(expense.id);

        const foreignExpense = await app.request('/api/expenses', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerB.cookie },
          body: JSON.stringify({
            description: 'Stolen',
            amount: '5.00',
            expenseDate: '2026-09-01',
          }),
        });
        expect(foreignExpense.status).toBe(201);
        const otherExpense = expenseSchema.parse(await foreignExpense.json());
        const foreignMatch = await app.request(`/api/reconciliation-sessions/${session.id}/matches`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            bankTransactionId: bankTx!.id,
            bookItemType: 'expense',
            bookItemId: otherExpense.id,
          }),
        });
        expect(foreignMatch.status).toBe(400);

        const balanced = await app.request(`/api/reconciliation-sessions/${session.id}/complete`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
        });
        expect(balanced.status).toBe(200);
        expect(reconciliationSessionSchema.parse(await balanced.json()).status).toBe('completed');

        const unbalancedAccount = await seedBankAccount(app, ownerA.cookie);
        const unbalancedRes = await app.request('/api/reconciliation-sessions', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            bankAccountId: unbalancedAccount.id,
            statementStartDate: '2026-09-01',
            statementEndDate: '2026-09-30',
            statementOpeningBalance: '0.00',
            statementClosingBalance: '100.00',
          }),
        });
        expect(unbalancedRes.status).toBe(201);
        const unbalanced = reconciliationSessionSchema.parse(await unbalancedRes.json());
        const complete = await app.request(`/api/reconciliation-sessions/${unbalanced.id}/complete`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
        });
        expect(complete.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await complete.json()).error.code).toBe('RECONCILIATION_UNBALANCED');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
