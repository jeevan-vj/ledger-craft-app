import { customerSchema, invoiceListResponseSchema, recurringRunListResponseSchema, recurringTemplateListResponseSchema, recurringTemplateSchema, runRecurringDueResponseSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const cookie = (response: Response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
async function signUp(app: ReturnType<typeof createApp>) { const response = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Scheduler owner', email: `${crypto.randomUUID()}@example.test`, password: 'password123' }) }); return cookie(response); }

describe('recurring scheduler', () => {
  it('catches up month-end occurrences once, isolates tenants, pauses and records failures', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db }); const owner = await signUp(app); const other = await signUp(app);
        const h = { ...headers, Cookie: owner };
        await app.request('/api/business-profile', { method: 'PUT', headers: h, body: JSON.stringify({ name: 'Scheduler Ltd', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' }) });
        const customerResponse = await app.request('/api/customers', { method: 'POST', headers: h, body: JSON.stringify({ name: 'Monthly client', email: 'client@example.test', country: 'NZ' }) });
        const customerId = customerSchema.parse(await customerResponse.json()).id;
        const createBody = { name: 'Month end invoice', payload: { kind: 'invoice', input: { customerId, date: '2026-01-31', dueDate: '2026-02-28', items: [{ description: 'Retainer', quantity: '1', rate: '100.25' }] } }, schedule: { frequency: 'monthly', interval: 1, startDate: '2026-01-31', timezone: 'Pacific/Auckland', localTime: '09:00', occurrenceLimit: 3 } };
        const createdResponse = await app.request('/api/recurring-templates', { method: 'POST', headers: h, body: JSON.stringify(createBody) });
        expect(createdResponse.status).toBe(201); const template = recurringTemplateSchema.parse(await createdResponse.json());
        const otherList = await app.request('/api/recurring-templates', { headers: { Cookie: other } });
        expect(recurringTemplateListResponseSchema.parse(await otherList.json()).templates).toHaveLength(0);
        expect((await app.request(`/api/recurring-templates/${template.id}/pause`, { method: 'POST', headers: h })).status).toBe(200);
        expect((await app.request(`/api/recurring-templates/${template.id}/resume`, { method: 'POST', headers: h })).status).toBe(200);
        const [first, concurrent] = await Promise.all([
          app.request('/api/recurring-runs/process', { method: 'POST', headers: h, body: JSON.stringify({ now: '2026-04-01T00:00:00.000Z', limit: 10 }) }),
          app.request('/api/recurring-runs/process', { method: 'POST', headers: h, body: JSON.stringify({ now: '2026-04-01T00:00:00.000Z', limit: 10 }) }),
        ]);
        expect(runRecurringDueResponseSchema.parse(await first.json()).succeeded + runRecurringDueResponseSchema.parse(await concurrent.json()).succeeded).toBe(3);
        const invoiceResponse = await app.request('/api/invoices', { headers: h }); const invoices = invoiceListResponseSchema.parse(await invoiceResponse.json());
        expect(invoices.invoices).toHaveLength(3); expect(new Set(invoices.invoices.map((row) => row.date))).toEqual(new Set(['2026-01-31', '2026-02-28', '2026-03-31']));
        const runsResponse = await app.request(`/api/recurring-runs?templateId=${template.id}`, { headers: h }); const runs = recurringRunListResponseSchema.parse(await runsResponse.json());
        expect(runs.runs).toHaveLength(3); expect(new Set(runs.runs.map((run) => run.occurrenceKey)).size).toBe(3);
        const failedResponse = await app.request('/api/recurring-templates', { method: 'POST', headers: h, body: JSON.stringify({ ...createBody, name: 'Invalid customer', payload: { ...createBody.payload, input: { ...createBody.payload.input, customerId: crypto.randomUUID() } }, schedule: { ...createBody.schedule, occurrenceLimit: 1 } }) }); const failed = recurringTemplateSchema.parse(await failedResponse.json());
        await app.request('/api/recurring-runs/process', { method: 'POST', headers: h, body: JSON.stringify({ now: '2026-04-01T00:00:00.000Z', limit: 10 }) });
        const failedRunsResponse = await app.request(`/api/recurring-runs?templateId=${failed.id}`, { headers: h }); const failedRuns = recurringRunListResponseSchema.parse(await failedRunsResponse.json());
        expect(failedRuns.runs[0]).toMatchObject({ status: 'failed', attemptCount: 1 }); expect(failedRuns.runs[0].failureReason).toContain('Customer not found');
      } finally { await sql.end({ timeout: 5 }); }
    });
  });
});
