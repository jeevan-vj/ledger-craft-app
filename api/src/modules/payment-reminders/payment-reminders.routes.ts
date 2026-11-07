import { Hono } from 'hono';
import { reminderSettingsRequestSchema, reminderOptOutRequestSchema } from '@ledgercraft/contracts';
import type { AppEnv } from '../../types';
import type { InvoiceMailer } from '../invoices/mailer';
import { requireSession } from '../auth/require-session';
import * as service from './payment-reminders.service';
export function reminderRoutes(options: {
    mailer?: InvoiceMailer;
} = {}) {
    const r = new Hono<AppEnv>();
    for (const prefix of ['', '/api']) {
        r.get(`${prefix}/payment-reminders/settings`, async (c) => { const { db, user } = await requireSession(c); return c.json(await service.reminderSettingsForUser(db, user.id, options.mailer)); });
        r.put(`${prefix}/payment-reminders/settings`, async (c) => { const { db, user } = await requireSession(c); const value = await service.updateReminderSettingsForUser(db, user.id, reminderSettingsRequestSchema.parse(await c.req.json()), options.mailer); if (value.enabled)
            await c.get('scheduleRecurringAlarm')?.(Date.now() + 60000); return c.json(value); });
        for (const [segment, kind] of [['customers', 'customer'], ['invoices', 'invoice']] as const) {
            r.get(`${prefix}/payment-reminders/${segment}/:id`, async (c) => { const { db, user } = await requireSession(c); return c.json(await service.reminderOptOutForUser(db, user.id, kind, c.req.param('id'))); });
            r.put(`${prefix}/payment-reminders/${segment}/:id`, async (c) => { const { db, user } = await requireSession(c); const body = reminderOptOutRequestSchema.parse(await c.req.json()); return c.json(await service.setReminderOptOutForUser(db, user.id, kind, c.req.param('id'), body.optOut)); });
        }
        r.get(`${prefix}/invoices/:id/reminder-log`, async (c) => { const { db, user } = await requireSession(c); return c.json(await service.reminderLogForUser(db, user.id, c.req.param('id'))); });
    }
    return r;
}
