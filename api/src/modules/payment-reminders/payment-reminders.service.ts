import { reminderSettingsRequestSchema, type ReminderSettingsRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { invoices } from '../../db/schema/invoices';
import { and, eq } from 'drizzle-orm';
import { decimal, roundMoney } from '../invoices/money';
import type { InvoiceMailer } from '../invoices/mailer';
import { getBusinessProfile } from '../business-profile/business-profile.repository';
import { customer } from '../customer-statements/customer-statements.repository';
import * as repo from './payment-reminders.repository';
import { createInvoiceShareInTx } from '../invoices/share';
const defaults: ReminderSettingsRequest = { enabled: false, timeZone: 'Pacific/Auckland', localTime: '09:00', steps: [{ id: 'before-due', offsetDays: -3, reminderType: 'gentle' }, { id: 'due', offsetDays: 0, reminderType: 'gentle' }, { id: 'week-overdue', offsetDays: 7, reminderType: 'firm' }, { id: 'fortnight-overdue', offsetDays: 14, reminderType: 'final' }] };
export function presentSettings(value: Awaited<ReturnType<typeof repo.settings>>, mailer?: InvoiceMailer) { const settings = value ? reminderSettingsRequestSchema.parse({ ...value, steps: value.steps }) : defaults; return { ...settings, emailAvailable: mailer?.availability === 'available', warnings: mailer?.availability === 'available' ? [] : ['Email delivery is unavailable. Scheduled steps are logged as skipped without retrying.'] }; }
export async function reminderSettingsForUser(db: Database, userId: string, mailer?: InvoiceMailer) { return withOrganisationTx(db, userId, async (tx, ctx) => presentSettings(await repo.settings(tx, ctx.organisationId), mailer)); }
export async function updateReminderSettingsForUser(db: Database, userId: string, input: ReminderSettingsRequest, mailer?: InvoiceMailer) { const value = reminderSettingsRequestSchema.parse(input); return withOrganisationTx(db, userId, async (tx, ctx) => { if (!['owner', 'admin'].includes(ctx.role))
    throw new HTTPException(403, { message: 'Only owners and administrators can change automatic reminder settings' }); await repo.saveSettings(tx, { organisationId: ctx.organisationId, ...value }); return presentSettings(await repo.settings(tx, ctx.organisationId), mailer); }); }
async function requireSource(tx: Database, org: string, kind: 'customer' | 'invoice', id: string) { if (kind === 'customer') {
    if (!await customer(tx, org, id))
        throw new HTTPException(404, { message: 'Customer not found' });
}
else {
    const [row] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.organisationId, org), eq(invoices.id, id)));
    if (!row)
        throw new HTTPException(404, { message: 'Invoice not found' });
} }
export async function reminderOptOutForUser(db: Database, userId: string, kind: 'customer' | 'invoice', id: string) { return withOrganisationTx(db, userId, async (tx, ctx) => { await requireSource(tx, ctx.organisationId, kind, id); return { optOut: await repo.optOut(tx, ctx.organisationId, kind, id) }; }); }
export async function setReminderOptOutForUser(db: Database, userId: string, kind: 'customer' | 'invoice', id: string, optOut: boolean) { return withOrganisationTx(db, userId, async (tx, ctx) => { if (!['owner', 'admin', 'accountant'].includes(ctx.role))
    throw new HTTPException(403, { message: 'An owner, administrator or accountant must change reminder preferences' }); await requireSource(tx, ctx.organisationId, kind, id); await repo.saveOptOut(tx, ctx.organisationId, kind, id, optOut); return { optOut }; }); }
export async function reminderLogForUser(db: Database, userId: string, id: string) { return withOrganisationTx(db, userId, async (tx, ctx) => { await requireSource(tx, ctx.organisationId, 'invoice', id); return { logs: (await repo.logs(tx, ctx.organisationId, id)).map(v => ({ ...v, createdAt: v.createdAt.toISOString(), sentAt: v.sentAt?.toISOString() ?? null })) }; }); }
function localClock(now: Date, timeZone: string) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); const part = (type: string) => parts.find(v => v.type === type)!.value; return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` }; }
function scheduledDate(due: string, days: number) { const d = new Date(due + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function text(template: string, vars: Record<string, string>) { return template.replace(/\{(customer|invoiceNumber|amountDue|dueDate|payLink)\}/g, (_, key: string) => vars[key] ?? ''); }
/** Each step is claimed before I/O. An uncertain delivery stays 'sending' for
 * human review; alarms never blindly resend it. Stable provider idempotency
 * keys protect accepted mail if the transport repeats a request. */
export async function runPaymentReminders(db: Database, org: string, mailer: InvoiceMailer, now = new Date(), appUrl = 'http://localhost:8080', trustedActor?: {userId:string}|null) {
    if(trustedActor===null)return {processed:0,sent:0,nextRunAt:null};
    if(trustedActor&&!await repo.isDeliveryActor(db,org,trustedActor.userId))return {processed:0,sent:0,nextRunAt:now.getTime()+60_000};
    const settings = await repo.settings(db, org);
    if (!settings?.enabled)
        return { processed: 0, sent: 0, nextRunAt: null };
    const config = reminderSettingsRequestSchema.parse({ ...settings, steps: settings.steps });
    const clock = localClock(now, config.timeZone);
    let processed = 0, sent = 0;
    if (clock.time < config.localTime)
        return { processed, sent, nextRunAt: now.getTime() + 60000 };
    for (const candidate of await repo.candidates(db, org))
        for (const step of config.steps) {
            const date = scheduledDate(candidate.invoice.dueDate, step.offsetDays);
            if (date !== clock.date)
                continue;
            const claimed = await db.transaction(async (tx) => {
                const fresh = (await repo.candidates(tx, org)).find(v => v.invoice.id === candidate.invoice.id);
                if (!fresh || decimal(fresh.invoice.balanceDue).compare(0) <= 0 || await repo.optOut(tx, org, 'invoice', fresh.invoice.id) || await repo.optOut(tx, org, 'customer', fresh.customer.id))
                    return;
                // A previously claimed step is never sent twice, even across alarm retries.
                if ((await repo.logs(tx, org, fresh.invoice.id)).some(v => v.stepId === step.id))
                    return;
                let reason: string | null = mailer.availability !== 'available' || !mailer.sendReminder ? 'email_unavailable' : !fresh.customer.email.trim() ? 'customer_email_missing' : null;
                let publicUrl: string | undefined;
                if (!reason) {
                    const userId = trustedActor?.userId ?? await repo.deliveryActor(tx, org);
                    if (!userId)
                        reason = 'authorised_sender_unavailable';
                    else
                        try {
                            const shared = await createInvoiceShareInTx(tx, { organisationId: org, userId }, fresh.invoice.id, { templateName: 'classic', expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString() });
                            publicUrl = `${appUrl.replace(/\/$/, '')}/shared/invoice/${shared.share.shareToken}`;
                        }
                        catch (error) {
                            if (error instanceof HTTPException)
                                reason = 'invoice_share_requires_review';
                            else
                                throw error;
                        }
                }
                const [claim] = await repo.claim(tx, { organisationId: org, invoiceId: fresh.invoice.id, stepId: step.id, scheduledDate: date, status: reason ? 'skipped' : 'sending', reason });
                return claim ? { claim, fresh, skip: reason !== null, publicUrl } : undefined;
            });
            if (!claimed)
                continue;
            processed++;
            if (claimed.skip)
                continue;
            const profile = await getBusinessProfile(db, org);
            const invoice = claimed.fresh.invoice;
            const vars = { customer: claimed.fresh.customer.name, invoiceNumber: invoice.invoiceNumber, amountDue: `${invoice.currency} ${roundMoney(invoice.balanceDue)}`, dueDate: invoice.dueDate, payLink: claimed.publicUrl ?? '' };
            try {
                await mailer.sendReminder!({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, to: [claimed.fresh.customer.email], businessName: profile?.name, amountDue: roundMoney(invoice.balanceDue), currency: invoice.currency, dueDate: invoice.dueDate, publicUrl: claimed.publicUrl, subject: text(step.subject ?? `${step.reminderType === 'final' ? 'Final payment reminder' : step.reminderType === 'firm' ? 'Overdue payment reminder' : 'Payment reminder'}: {invoiceNumber}`, vars), message: text(step.message ?? 'Hello {customer}, please review invoice {invoiceNumber}. Amount due: {amountDue}. Due date: {dueDate}.', vars), deliveryKey: `scheduled-reminder/${org}/${invoice.id}/${step.id}` });
                await repo.finish(db, org, claimed.claim.id, 'sent', null);
                sent++;
            }
            catch {
                await repo.finish(db, org, claimed.claim.id, 'failed', 'email_delivery_failed');
            }
        }
    return { processed, sent, nextRunAt: now.getTime() + 60000 };
}
