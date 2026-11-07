import { expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const body = { name: 'Monthly rent', payload: { kind: 'expense', input: { description: 'Rent', amount: '1150.01', expenseDate: '2027-01-31' } }, schedule: { frequency: 'monthly', interval: 1, startDate: '2027-01-31', timezone: 'Pacific/Auckland', localTime: '09:00' } };
it('replays canonical create and update requests, rejects mismatches and keeps tenant scopes separate', async () => withTestDb(async () => {
  const { db, sql } = createDb(getDatabaseUrl());
  try {
    const app = createApp({ db, auth: createAuth(db) });
    async function owner() { const response = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Recurring owner', email: `${crypto.randomUUID()}@example.test`, password: 'password123' }) }); expect(response.status).toBe(200); return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; '); }
    const cookie = await owner(); const other = await owner();
    const h = { ...headers, Cookie: cookie, 'Idempotency-Key': 'schedule-operation' };
    async function create(hh: Record<string, string> = h, input: unknown = body) { const response = await app.request('/api/recurring-templates', { method: 'POST', headers: hh, body: JSON.stringify(input) }); return { status: response.status, body: await response.json() as { id: string; name: string } }; }
    const [first, replay] = await Promise.all([create(), create()]); expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(replay.body).toEqual(first.body);
    const list = await app.request('/api/recurring-templates', { headers: { Cookie: cookie } }); expect((await list.json() as { templates: unknown[] }).templates).toHaveLength(1);
    expect((await create(h, { ...body, name: 'Changed' })).status).toBe(409);
    const isolated = await create({ ...h, Cookie: other }); expect(isolated.status).toBe(201); expect(isolated.body.id).not.toBe(first.body.id);
    const patch = async (name: string) => app.request(`/api/recurring-templates/${first.body.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ name }) });
    const changed = await patch('Rent reviewed'); expect(changed.status).toBe(200); const updated = await changed.json();
    const again = await patch('Rent reviewed'); expect(again.status).toBe(200); expect(await again.json()).toEqual(updated);
    expect((await patch('Different name')).status).toBe(409);
    expect((await create({ ...h, 'Idempotency-Key': 'invalid/key' })).status).toBe(400);
    const { 'Idempotency-Key': omitted, ...withoutKey } = h; void omitted;
    expect((await create(withoutKey)).status).toBe(201);
    expect((await create(withoutKey)).status).toBe(201);
  } finally { await sql.end({ timeout: 5 }); }
}));
