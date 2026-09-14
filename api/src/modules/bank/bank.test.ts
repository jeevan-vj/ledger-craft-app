import {
  bankAccountListResponseSchema,
  bankAccountSchema,
  bankTransactionListResponseSchema,
  errorEnvelopeSchema,
  importBankTransactionsResponseSchema,
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

describe('bank routes', () => {
  it('unauthenticated GET /api/bank-accounts returns 401', async () => {
    const response = await createApp().request('/api/bank-accounts');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('creates bank accounts and skips duplicate imports for the session organisation', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');

        const created = await app.request('/api/bank-accounts', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            accountName: 'Business cheque',
            accountNumber: '12-3456-7890123-00',
            bankName: 'ANZ',
            accountType: 'checking',
            openingBalance: '0.00',
          }),
        });
        expect(created.status).toBe(201);
        const account = bankAccountSchema.parse(await created.json());
        expect(account.openingBalance).toBe('0.00');
        expect(account.currentBalance).toBe('0.00');

        const ownership = await app.request('/api/bank-accounts', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            accountName: 'Sneaky',
            accountNumber: '00-0000-0000000-00',
            bankName: 'ANZ',
            accountType: 'checking',
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const leaked = await app.request(`/api/bank-accounts/${account.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(leaked.status).toBe(404);

        const listB = bankAccountListResponseSchema.parse(
          await (await app.request('/api/bank-accounts', { headers: { Cookie: ownerB.cookie } })).json(),
        );
        expect(listB.bankAccounts).toEqual([]);

        const txBody = {
          bankAccountId: account.id,
          fileName: 'anz.csv',
          skipDuplicates: true,
          transactions: [
            {
              transactionDate: '2026-09-01',
              description: 'Adobe',
              amount: '79.00',
              type: 'debit',
            },
          ],
        };
        const imported = await app.request('/api/bank-transactions/import', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify(txBody),
        });
        expect(imported.status).toBe(201);
        const first = importBankTransactionsResponseSchema.parse(await imported.json());
        expect(first.importedCount).toBe(1);
        expect(first.duplicatesSkipped).toBe(0);
        expect(first.transactions[0]?.amount).toBe('79.00');

        const duplicate = await app.request('/api/bank-transactions/import', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify(txBody),
        });
        expect(duplicate.status).toBe(201);
        const second = importBankTransactionsResponseSchema.parse(await duplicate.json());
        expect(second.importedCount).toBe(0);
        expect(second.duplicatesSkipped).toBe(1);

        const listed = bankTransactionListResponseSchema.parse(
          await (
            await app.request(`/api/bank-transactions?bankAccountId=${account.id}`, {
              headers: { Cookie: ownerA.cookie },
            })
          ).json(),
        );
        expect(listed.transactions).toHaveLength(1);

        const foreignImport = await app.request('/api/bank-transactions/import', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerB.cookie },
          body: JSON.stringify(txBody),
        });
        expect(foreignImport.status).toBe(400);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
