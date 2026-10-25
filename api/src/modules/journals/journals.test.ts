import { errorEnvelopeSchema, journalEntrySchema } from '@ledgercraft/contracts';
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

async function seedAccounts(app: ReturnType<typeof createApp>, cookie: string) {
  const seeded = await app.request('/api/accounts/initialize', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({}),
  });
  expect(seeded.status).toBe(200);
  const body = (await seeded.json()) as { accounts: Array<{ id: string; accountNumber: string | null }> };
  const debit = body.accounts.find((account) => account.accountNumber === '1200');
  const credit = body.accounts.find((account) => account.accountNumber === '4000');
  expect(debit && credit).toBeTruthy();
  return { debitId: debit!.id, creditId: credit!.id };
}

async function createDraft(app: ReturnType<typeof createApp>, cookie: string, accounts: { debitId: string; creditId: string }, description: string) {
  const response = await app.request('/api/journal-entries', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ description, entryDate: '2026-09-11', debitAccountId: accounts.debitId, creditAccountId: accounts.creditId, amount: '10.00' }),
  });
  expect(response.status, description).toBe(201);
  return journalEntrySchema.parse(await response.json());
}

describe('journal routes', () => {
  it('unauthenticated GET /api/journal-entries returns 401', async () => {
    const response = await createApp().request('/api/journal-entries');
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('creates a balanced journal and isolates organisations', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');
        const accounts = await seedAccounts(app, ownerA.cookie);

        const ownership = await app.request('/api/journal-entries', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            description: 'Rent',
            entryDate: '2026-09-11',
            debitAccountId: accounts.debitId,
            creditAccountId: accounts.creditId,
            amount: '250.00',
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const created = await app.request('/api/journal-entries', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            description: 'Rent',
            entryDate: '2026-09-11',
            debitAccountId: accounts.debitId,
            creditAccountId: accounts.creditId,
            amount: '250.00',
          }),
        });
        expect(created.status).toBe(201);
        const entry = journalEntrySchema.parse(await created.json());
        expect(entry.status).toBe('draft');
        expect(entry.debitAmount).toBe('250.00');
        expect(entry.creditAmount).toBe('250.00');

        const posted = await app.request(`/api/journal-entries/${entry.id}`, {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ status: 'posted' }),
        });
        expect(posted.status).toBe(200);
        expect(journalEntrySchema.parse(await posted.json()).status).toBe('posted');

        const hidden = await app.request(`/api/journal-entries/${entry.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(hidden.status).toBe(404);
        expect(errorEnvelopeSchema.parse(await hidden.json()).error.code).toBe('NOT_FOUND');
      } finally {
        await sql.end();
      }
    });
  });
  it('numbers new journals after a deleted draft without colliding with the unique entry number', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Numbering Owner');
        const accounts = await seedAccounts(app, owner.cookie);
        const first = await createDraft(app, owner.cookie, accounts, 'First draft');
        const second = await createDraft(app, owner.cookie, accounts, 'Second draft');
        const deleted = await app.request(`/api/journal-entries/${first.id}`, { method: 'DELETE', headers: { ...originHeaders, Cookie: owner.cookie } });
        expect(deleted.status).toBeLessThan(300);
        // count(*)+1 would reuse second.entryNumber here and hit the unique index.
        const third = await createDraft(app, owner.cookie, accounts, 'Third draft');
        expect(third.entryNumber).not.toBe(second.entryNumber);
        expect(third.entryNumber).toBe('JE-2026-003');
      } finally {
        await sql.end();
      }
    });
  });
});
