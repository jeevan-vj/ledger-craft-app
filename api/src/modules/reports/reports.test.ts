import { errorEnvelopeSchema, financialReportResponseSchema, generalLedgerResponseSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const cookie = (response: Response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST', headers,
    body: JSON.stringify({ name, email: `${crypto.randomUUID()}@example.com`, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return cookie(response);
}

async function seedPostedJournal(app: ReturnType<typeof createApp>, session: string, amount: string) {
  const initialized = await app.request('/api/accounts/initialize', { method: 'POST', headers: { ...headers, Cookie: session }, body: '{}' });
  const accounts = (await initialized.json() as { accounts: Array<{ id: string; accountNumber: string }> }).accounts;
  const debit = accounts.find((account) => account.accountNumber === '1200')!;
  const credit = accounts.find((account) => account.accountNumber === '4000')!;
  const created = await app.request('/api/journal-entries', {
    method: 'POST', headers: { ...headers, Cookie: session },
    body: JSON.stringify({ description: 'Golden sale', entryDate: '2026-04-15', debitAccountId: debit.id, creditAccountId: credit.id, amount }),
  });
  const entry = await created.json() as { id: string };
  await app.request(`/api/journal-entries/${entry.id}`, {
    method: 'PATCH', headers: { ...headers, Cookie: session }, body: JSON.stringify({ status: 'posted' }),
  });
  return entry.id;
}

describe('server-authoritative reports', () => {
  it('requires authentication and validates period boundaries', async () => {
    const app = createApp();
    expect((await app.request('/api/reports/financial?from=2026-01-01&to=2026-12-31')).status).toBe(401);
    const invalid = await app.request('/api/reports/financial?from=2026-12-31&to=2026-01-01', { headers: { Cookie: 'session=fake' } });
    expect([400, 401]).toContain(invalid.status);
  });

  it('derives balanced reports from posted journals and isolates organisations', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Report Owner A');
        const ownerB = await signUp(app, 'Report Owner B');
        await seedPostedJournal(app, ownerA, '125.50');

        const response = await app.request('/api/reports/financial?from=2026-01-01&to=2026-12-31&basis=accrual&baseCurrency=NZD', { headers: { Cookie: ownerA } });
        expect(response.status).toBe(200);
        const report = financialReportResponseSchema.parse(await response.json());
        expect(report.trialBalance.balanced).toBe(true);
        expect(report.trialBalance.totalDebits).toBe('125.50');
        expect(report.trialBalance.totalCredits).toBe('125.50');
        expect(report.profitLoss.revenue).toBe('125.50');
        expect(report.profitLoss.netIncome).toBe('125.50');
        expect(report.balanceSheet.balanced).toBe(true);

        const hidden = financialReportResponseSchema.parse(await (await app.request('/api/reports/financial?from=2026-01-01&to=2026-12-31', { headers: { Cookie: ownerB } })).json());
        expect(hidden.trialBalance.totalDebits).toBe('0.00');
        expect(hidden.profitLoss.revenue).toBe('0.00');

        const ledger = generalLedgerResponseSchema.parse(await (await app.request('/api/reports/general-ledger?from=2026-01-01&to=2026-12-31', { headers: { Cookie: ownerA } })).json());
        expect(ledger.lines).toHaveLength(2);
      } finally {
        await sql.end();
      }
    });
  });

  it('rejects mutation or deletion of posted journals', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Immutable Owner');
        const entryId = await seedPostedJournal(app, owner, '10.00');
        const update = await app.request(`/api/journal-entries/${entryId}`, { method: 'PATCH', headers: { ...headers, Cookie: owner }, body: JSON.stringify({ status: 'draft' }) });
        expect(update.status).toBe(409);
        const deletion = await app.request(`/api/journal-entries/${entryId}`, { method: 'DELETE', headers: { Cookie: owner } });
        expect(deletion.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await deletion.json()).error.code).toBe('CONFLICT');
      } finally { await sql.end(); }
    });
  });
});
