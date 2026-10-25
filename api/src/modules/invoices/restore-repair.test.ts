import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { invoices } from '../../db/schema/invoices';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { repairInvoiceRestoreJournals } from './restore-repair';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

async function call(app: ReturnType<typeof createApp>, path: string, init: RequestInit, status: number) {
  const response = await app.request(path, init);
  expect(response.status, path).toBe(status);
  return await response.json() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('invoice restore journal repair', () => {
  it('finds active invoices with a missing restore journal, dry-runs by default, and repairs idempotently', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const signUp = await app.request('/api/auth/sign-up/email', {
          method: 'POST', headers,
          body: JSON.stringify({ name: 'Repair Owner', email: `repair-${crypto.randomUUID()}@example.com`, password: 'Local-repair-123!' }),
        });
        const cookie = signUp.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
        const auth = { ...headers, Cookie: cookie };
        await call(app, '/api/business-profile', { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Repair Ltd', email: 'repair@example.nz', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered', invoiceNumberFormat: 'INV-{YYYY}-{SEQ}', invoiceNumberSequence: 1 }) }, 200);
        const customer = await call(app, '/api/customers', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Repair Customer', email: 'c@example.nz', country: 'NZ' }) }, 201);
        const draft = await call(app, '/api/invoices', { method: 'POST', headers: { ...auth, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ customerId: customer.id, date: '2026-05-01', dueDate: '2026-05-01', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Sale', quantity: '1', rate: '200.00' }] }) }, 201);
        await call(app, `/api/invoices/${draft.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'sent' }) }, 200);
        const outputGst = async () => (await call(app, '/api/reports/financial?from=2000-01-01&to=2099-12-31&basis=accrual&baseCurrency=NZD', { headers: { Cookie: cookie } }, 200)).taxSummary.outputGst;
        await call(app, `/api/invoices/${draft.id}/cancel`, { method: 'POST', headers: auth, body: '{}' }, 200);
        await call(app, `/api/invoices/${draft.id}/restore`, { method: 'POST', headers: auth, body: '{}' }, 200);
        expect(await outputGst()).toBe('30.00');
        expect((await repairInvoiceRestoreJournals(db)).candidates).toEqual([]);

        // Recreate the legacy damage: the second cancel posted its reversal, but
        // the old restore path flipped the invoice back without a restore journal.
        await call(app, `/api/invoices/${draft.id}/cancel`, { method: 'POST', headers: auth, body: '{}' }, 200);
        await db.update(invoices).set({ status: 'sent', lifecycleStatus: 'active', preCancelStatus: null }).where(eq(invoices.id, draft.id));
        expect(await outputGst()).toBe('0.00');

        const dryRun = await repairInvoiceRestoreJournals(db);
        expect(dryRun).toMatchObject({ applied: false, journalsPosted: 0 });
        expect(dryRun.candidates).toEqual([expect.objectContaining({ invoiceId: draft.id, cancellations: 2, restores: 1, missingRestores: 1 })]);
        expect(await outputGst()).toBe('0.00');

        const applied = await repairInvoiceRestoreJournals(db, { apply: true });
        expect(applied).toMatchObject({ applied: true, journalsPosted: 1 });
        expect(await outputGst()).toBe('30.00');

        const rerun = await repairInvoiceRestoreJournals(db, { apply: true });
        expect(rerun).toMatchObject({ candidates: [], journalsPosted: 0 });
        expect(await outputGst()).toBe('30.00');
      } finally {
        await sql.end();
      }
    });
  });
});
