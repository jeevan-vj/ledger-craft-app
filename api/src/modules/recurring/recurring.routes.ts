import { createRecurringTemplateRequestSchema, recurringPreviewRequestSchema, runRecurringDueRequestSchema, updateRecurringTemplateRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as service from './recurring.service';

export function recurringRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/recurring-templates`, async (c) => { const { db, user } = await requireSession(c); return c.json({ templates: await service.listTemplatesForUser(db, user.id) }); });
    routes.get(`${prefix}/recurring-runs`, async (c) => { const { db, user } = await requireSession(c); return c.json({ runs: await service.listRunsForUser(db, user.id, c.req.query('templateId')) }); });
    routes.post(`${prefix}/recurring-templates/preview`, async (c) => { await requireSession(c); return c.json(service.previewOccurrences(recurringPreviewRequestSchema.parse(await c.req.json()))); });
    routes.post(`${prefix}/recurring-templates`, async (c) => { const { db, user } = await requireSession(c); const result = await service.createTemplateForUser(db, user.id, createRecurringTemplateRequestSchema.parse(await c.req.json())); await c.get('scheduleRecurringAlarm')?.(new Date(result.nextRunAt!).getTime()); return c.json(result, 201); });
    routes.patch(`${prefix}/recurring-templates/:id`, async (c) => { const { db, user } = await requireSession(c); const result = await service.updateTemplateForUser(db, user.id, c.req.param('id'), updateRecurringTemplateRequestSchema.parse(await c.req.json())); if (result.nextRunAt) await c.get('scheduleRecurringAlarm')?.(new Date(result.nextRunAt).getTime()); return c.json(result); });
    for (const action of ['pause', 'resume', 'end'] as const) routes.post(`${prefix}/recurring-templates/:id/${action}`, async (c) => { const { db, user } = await requireSession(c); const result = await service.changeStatusForUser(db, user.id, c.req.param('id'), action); if (result?.nextRunAt) await c.get('scheduleRecurringAlarm')?.(new Date(result.nextRunAt).getTime()); return c.json(result); });
    routes.post(`${prefix}/recurring-runs/process`, async (c) => { const { db, user } = await requireSession(c); let body: unknown = {}; try { body = await c.req.json(); } catch { body = {}; } const input = runRecurringDueRequestSchema.parse(body); const result = await service.runDueForUser(db, user.id, input.now ? new Date(input.now) : new Date(), input.limit, c.get('invoiceMailer')); if (result.nextAlarmAt) await c.get('scheduleRecurringAlarm')?.(new Date(result.nextAlarmAt).getTime()); return c.json(result); });
  }
  return routes;
}
