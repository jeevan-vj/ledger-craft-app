import {
  customerSchema,
  invoiceListResponseSchema,
  recurringPreviewResponseSchema,
  recurringRunListResponseSchema,
  recurringTemplateSchema,
  runRecurringDueResponseSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import type { InvoiceMailer } from '../invoices/mailer';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const cookie = (response: Response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

async function signUp(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'Recurring owner', email: `${crypto.randomUUID()}@example.test`, password: 'password123' }),
  });
  return cookie(response);
}

async function seedInvoiceContext(app: ReturnType<typeof createApp>, owner: string) {
  const authenticated = { ...headers, Cookie: owner };
  await app.request('/api/business-profile', {
    method: 'PUT', headers: authenticated,
    body: JSON.stringify({ name: 'Recurring Studio', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' }),
  });
  const response = await app.request('/api/customers', {
    method: 'POST', headers: authenticated,
    body: JSON.stringify({ name: 'Scheduled client', email: 'client@example.test', country: 'NZ' }),
  });
  return customerSchema.parse(await response.json()).id;
}

function invoiceTemplate(customerId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Monthly retainer',
    payload: {
      kind: 'invoice',
      input: {
        customerId, date: '2027-01-31', dueDate: '2027-02-28',
        items: [{ description: 'Retainer', quantity: '1', rate: '100.00' }],
      },
      send: { mode: 'auto' },
    },
    schedule: {
      frequency: 'monthly', interval: 1, dayOfMonth: 31, startDate: '2027-01-31',
      timezone: 'Pacific/Auckland', localTime: '09:00', occurrenceLimit: 1,
    },
    ...overrides,
  };
}

describe('recurring preview and invoice delivery', () => {
  it('previews bounded month-end dates, validates input, and matches actual Auckland scheduledFor dates across DST', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db });
        const owner = await signUp(app);
        const authenticated = { ...headers, Cookie: owner };
        const schedule = {
          frequency: 'monthly', interval: 1, dayOfMonth: 28, startDate: '2026-03-28', endDate: '2026-10-28',
          occurrenceLimit: 8, timezone: 'Pacific/Auckland', localTime: '09:00',
        };
        const previewResponse = await app.request('/api/recurring-templates/preview', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ schedule }),
        });
        expect(previewResponse.status).toBe(200);
        const preview = recurringPreviewResponseSchema.parse(await previewResponse.json());
        expect(preview.occurrences).toHaveLength(5);
        expect(preview.occurrences.map((item) => item.localDate)).toEqual([
          '2026-03-28', '2026-04-28', '2026-05-28', '2026-06-28', '2026-07-28',
        ]);

        const bounded = await app.request('/api/recurring-templates/preview', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ schedule, count: 12 }),
        });
        const boundedPreview = recurringPreviewResponseSchema.parse(await bounded.json());
        expect(boundedPreview.occurrences).toHaveLength(8);
        const limited = await app.request('/api/recurring-templates/preview', {
          method: 'POST', headers: authenticated,
          body: JSON.stringify({ schedule: { ...schedule, occurrenceLimit: 2 }, count: 12 }),
        });
        expect(recurringPreviewResponseSchema.parse(await limited.json()).occurrences).toHaveLength(2);
        const invalid = await app.request('/api/recurring-templates/preview', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ schedule, count: 13 }),
        });
        expect(invalid.status).toBe(400);

        const customerId = await seedInvoiceContext(app, owner);
        const createdResponse = await app.request('/api/recurring-templates', {
          method: 'POST', headers: authenticated,
          body: JSON.stringify({
            ...invoiceTemplate(customerId), payload: { ...invoiceTemplate(customerId).payload, send: { mode: 'draft' } },
            schedule,
          }),
        });
        const template = recurringTemplateSchema.parse(await createdResponse.json());
        for (const occurrence of boundedPreview.occurrences) {
          const result = await app.request('/api/recurring-runs/process', {
            method: 'POST', headers: authenticated, body: JSON.stringify({ now: occurrence.runAt, limit: 1 }),
          });
          expect(runRecurringDueResponseSchema.parse(await result.json()).succeeded).toBe(1);
        }
        const runsResponse = await app.request(`/api/recurring-runs?templateId=${template.id}`, { headers: authenticated });
        const actual = recurringRunListResponseSchema.parse(await runsResponse.json()).runs
          .map((run) => run.scheduledFor).sort();
        expect(actual).toEqual(boundedPreview.occurrences.map((item) => item.runAt).sort());
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('auto-sends exactly once, posts one receivable journal, and does not duplicate on reprocessing', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const mailer: InvoiceMailer = { availability: 'available', sendInvoice: vi.fn().mockResolvedValue(undefined) };
        const app = createApp({ auth: createAuth(db), db, invoiceMailer: mailer });
        const owner = await signUp(app);
        const customerId = await seedInvoiceContext(app, owner);
        const authenticated = { ...headers, Cookie: owner };
        const sourceInvoiceId = crypto.randomUUID();
        const created = await app.request('/api/recurring-templates', {
          method: 'POST', headers: authenticated, body: JSON.stringify(invoiceTemplate(customerId, { sourceInvoiceId })),
        });
        const template = recurringTemplateSchema.parse(await created.json());
        expect(template.sourceInvoiceId).toBe(sourceInvoiceId);
        const unlinked = await app.request(`/api/recurring-templates/${template.id}`, {
          method: 'PATCH', headers: authenticated, body: JSON.stringify({ sourceInvoiceId: null }),
        });
        expect(recurringTemplateSchema.parse(await unlinked.json()).sourceInvoiceId).toBeNull();
        const now = '2027-01-31T20:00:00.000Z';
        const first = await app.request('/api/recurring-runs/process', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ now }),
        });
        expect(runRecurringDueResponseSchema.parse(await first.json()).succeeded).toBe(1);
        const second = await app.request('/api/recurring-runs/process', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ now }),
        });
        expect(runRecurringDueResponseSchema.parse(await second.json()).claimed).toBe(0);

        const invoicesResponse = await app.request('/api/invoices', { headers: authenticated });
        const invoices = invoiceListResponseSchema.parse(await invoicesResponse.json()).invoices;
        expect(invoices).toHaveLength(1);
        expect(invoices[0].status).toBe('sent');
        expect(mailer.sendInvoice).toHaveBeenCalledTimes(1);
        const journal = await sql.unsafe(
          'SELECT COUNT(*) AS count FROM journal_entries WHERE reference_type = ? AND reference_id = ?',
          ['invoice', invoices[0].id],
        ) as Array<{ count: number }>;
        expect(journal[0]?.count).toBe(1);
        const runsResponse = await app.request(`/api/recurring-runs?templateId=${template.id}`, { headers: authenticated });
        expect(recurringRunListResponseSchema.parse(await runsResponse.json()).runs[0]).toMatchObject({
          templateId: template.id, generatedId: invoices[0].id, deliveryStatus: 'sent', deliveryMessage: null,
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('keeps an unconfigured auto-send draft unless mark_sent is requested', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db });
        const owner = await signUp(app);
        const customerId = await seedInvoiceContext(app, owner);
        const authenticated = { ...headers, Cookie: owner };
        const draftTemplate = recurringTemplateSchema.parse(await (await app.request('/api/recurring-templates', {
          method: 'POST', headers: authenticated, body: JSON.stringify(invoiceTemplate(customerId)),
        })).json());
        await app.request('/api/recurring-runs/process', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ now: '2027-01-31T20:00:00.000Z' }),
        });
        const draftRuns = recurringRunListResponseSchema.parse(await (await app.request(`/api/recurring-runs?templateId=${draftTemplate.id}`, { headers: authenticated })).json());
        expect(draftRuns.runs[0]).toMatchObject({
          deliveryStatus: 'email_not_configured', deliveryMessage: 'Not emailed: email not configured',
        });

        const markedTemplate = recurringTemplateSchema.parse(await (await app.request('/api/recurring-templates', {
          method: 'POST', headers: authenticated,
          body: JSON.stringify(invoiceTemplate(customerId, {
            name: 'Fallback sent',
            payload: { ...invoiceTemplate(customerId).payload, send: { mode: 'auto', whenEmailUnavailable: 'mark_sent' } },
            schedule: { ...invoiceTemplate(customerId).schedule, startDate: '2027-02-28', occurrenceLimit: 1 },
          })),
        })).json());
        await app.request('/api/recurring-runs/process', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ now: '2027-02-28T20:00:00.000Z', limit: 10 }),
        });
        const invoices = invoiceListResponseSchema.parse(await (await app.request('/api/invoices', { headers: authenticated })).json()).invoices;
        expect(invoices.map((invoice) => invoice.status).sort()).toEqual(['draft', 'sent']);
        const markedRun = recurringRunListResponseSchema.parse(await (await app.request(`/api/recurring-runs?templateId=${markedTemplate.id}`, { headers: authenticated })).json()).runs[0];
        expect(markedRun).toMatchObject({ deliveryStatus: 'email_not_configured', deliveryMessage: 'Not emailed: email not configured' });
        const markedJournal = await sql.unsafe(
          'SELECT COUNT(*) AS count FROM journal_entries WHERE reference_type = ? AND reference_id = ?',
          ['invoice', markedRun.generatedId],
        ) as Array<{ count: number }>;
        expect(markedJournal[0]?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('keeps the generated invoice after a send failure and reuses it on delivery retry', async () => {
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const failingSend = vi.fn().mockRejectedValue(new Error('provider timeout'));
        const succeedingSend = vi.fn().mockResolvedValue(undefined);
        const auth = createAuth(db);
        const failingApp = createApp({ auth, db, invoiceMailer: { availability: 'available', sendInvoice: failingSend } });
        const owner = await signUp(failingApp);
        const customerId = await seedInvoiceContext(failingApp, owner);
        const authenticated = { ...headers, Cookie: owner };
        const template = recurringTemplateSchema.parse(await (await failingApp.request('/api/recurring-templates', {
          method: 'POST', headers: authenticated, body: JSON.stringify(invoiceTemplate(customerId)),
        })).json());
        const first = await failingApp.request('/api/recurring-runs/process', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ now: '2027-01-31T20:00:00.000Z' }),
        });
        expect(runRecurringDueResponseSchema.parse(await first.json())).toMatchObject({
          failed: 1, nextAlarmAt: '2027-01-31T20:05:00.000Z',
        });
        const failedRun = recurringRunListResponseSchema.parse(await (await failingApp.request(`/api/recurring-runs?templateId=${template.id}`, { headers: authenticated })).json()).runs[0];
        expect(failedRun).toMatchObject({ status: 'failed', deliveryStatus: 'failed', deliveryMessage: 'Failed to send invoice email' });
        expect(failedRun.generatedId).not.toBeNull();

        const retryApp = createApp({ auth, db, invoiceMailer: { availability: 'available', sendInvoice: succeedingSend } });
        const retried = await retryApp.request('/api/recurring-runs/process', {
          method: 'POST', headers: authenticated, body: JSON.stringify({ now: '2027-01-31T20:05:00.000Z' }),
        });
        expect(runRecurringDueResponseSchema.parse(await retried.json()).succeeded).toBe(1);
        const invoices = invoiceListResponseSchema.parse(await (await retryApp.request('/api/invoices', { headers: authenticated })).json()).invoices;
        expect(invoices).toHaveLength(1);
        expect(invoices[0]).toMatchObject({ id: failedRun.generatedId, status: 'sent' });
        expect(failingSend).toHaveBeenCalledTimes(1);
        expect(succeedingSend).toHaveBeenCalledTimes(1);
        const run = recurringRunListResponseSchema.parse(await (await retryApp.request(`/api/recurring-runs?templateId=${template.id}`, { headers: authenticated })).json()).runs[0];
        expect(run).toMatchObject({ status: 'succeeded', attemptCount: 2, generatedId: failedRun.generatedId, deliveryStatus: 'sent' });
        const journal = await sql.unsafe(
          'SELECT COUNT(*) AS count FROM journal_entries WHERE reference_type = ? AND reference_id = ?',
          ['invoice', failedRun.generatedId],
        ) as Array<{ count: number }>;
        expect(journal[0]?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
