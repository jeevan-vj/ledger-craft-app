import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { organisationMemberships } from '../../db/schema/identity';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from './auth';

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

function cookie(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}

describe('protected bulk and AI route permissions', () => {
  it('blocks read-only access and permits accountant invoice import, exports, and AI authorization', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db });
        const signUp = await app.request('/api/auth/sign-up/email', {
          method: 'POST', headers: jsonHeaders,
          body: JSON.stringify({ name: 'Permission Tester', email: `${crypto.randomUUID()}@example.test`, password: 'password123' }),
        });
        const authCookie = cookie(signUp);
        const headers = { ...jsonHeaders, Cookie: authCookie };
        await app.request('/api/business-profile', { method: 'PUT', headers, body: JSON.stringify({
          name: 'Permission Studio', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15',
        }) });
        const customerResponse = await app.request('/api/customers', { method: 'POST', headers, body: JSON.stringify({
          name: 'Import Customer', email: 'customer@example.test', country: 'NZ',
        }) });
        const customer = await customerResponse.json() as { id: string };
        const session = await auth.api.getSession({ headers: new Headers({ Cookie: authCookie }) });
        expect(session).toBeTruthy();
        const setRole = async (role: 'read_only' | 'accountant') => {
          await db.update(organisationMemberships).set({ role }).where(eq(organisationMemberships.userId, session!.user.id));
        };
        const importBody = JSON.stringify({ dryRun: false, rows: [{
          externalId: 'permission-import-1', customerId: customer.id, date: '2026-10-26', dueDate: '2026-11-26',
          items: [{ description: 'Imported work', quantity: '1', rate: '10' }],
        }] });
        const exports = ['/api/invoices-export.csv', '/api/bills-export.csv', '/api/vendors-export.csv', '/api/bank-transactions/export.csv'];

        await setRole('read_only');
        expect((await app.request('/api/invoices-import', { method: 'POST', headers, body: importBody })).status).toBe(403);
        for (const path of exports) expect((await app.request(path, { headers })).status).toBe(403);
        expect((await app.request('/api/items/export', { headers })).status).toBe(403);
        for (const path of ['/api/ai/receipt-scan', '/api/ai/chat']) {
          const body = path.endsWith('chat') ? { messages: [{ role: 'user', content: 'Hello' }] } : { imageBase64: 'abc' };
          expect((await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(403);
        }

        await setRole('accountant');
        expect((await app.request('/api/invoices-import', { method: 'POST', headers, body: importBody })).status).toBe(200);
        for (const path of exports) expect((await app.request(path, { headers })).status).toBe(200);
        // Item export uses the existing settings.write domain; accountant is intentionally not a settings writer.
        expect((await app.request('/api/items/export', { headers })).status).toBe(403);
        expect((await app.request('/api/ai/receipt-scan', {
          method: 'POST', headers, body: JSON.stringify({ imageBase64: 'abc' }),
        })).status).not.toBe(403);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
