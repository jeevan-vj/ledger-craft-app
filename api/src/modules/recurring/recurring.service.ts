import type { CreateBillRequest, CreateExpenseRequest, CreateInvoiceRequest, CreateRecurringTemplateRequest, RecurringPayload, RecurringSchedule, RunRecurringDueResponse, UpdateRecurringTemplateRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { createInvoiceForUser } from '../invoices/invoices.service';
import { hashIdempotencyPayload } from '../invoices/idempotency';
import { createBillForUser } from '../purchases/purchases.service';
import { createExpenseForUser } from '../expenses/expenses.service';
import { createBankTransactionForUser } from '../bank/bank.service';
import * as repo from './recurring.repository';
import { firstRunAt, nextRunAfter, occurrenceKey } from './schedule';

const dateOnly = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function occurrencePayload(payload: RecurringPayload, schedule: RecurringSchedule, scheduledFor: Date): RecurringPayload {
  const date = dateOnly(scheduledFor, schedule.timezone);
  if (payload.kind === 'invoice') { const dueDays = daysBetween(payload.input.date, payload.input.dueDate); return { ...payload, input: { ...payload.input, date, dueDate: plusDays(date, dueDays) } }; }
  if (payload.kind === 'bill') { const dueDays = daysBetween(payload.input.issueDate, payload.input.dueDate); return { ...payload, input: { ...payload.input, issueDate: date, dueDate: plusDays(date, dueDays) } }; }
  if (payload.kind === 'expense') return { ...payload, input: { ...payload.input, expenseDate: date } };
  return { ...payload, input: { ...payload.input, transactionDate: date } };
}

export async function listTemplatesForUser(db: Database, userId: string) { return withOrganisationTx(db, userId, (tx, ctx) => repo.listTemplates(tx, ctx.organisationId)); }
export async function listRunsForUser(db: Database, userId: string, templateId?: string) { return withOrganisationTx(db, userId, (tx, ctx) => repo.listRuns(tx, ctx.organisationId, templateId)); }
export async function createTemplateForUser(db: Database, userId: string, input: CreateRecurringTemplateRequest) { return withOrganisationTx(db, userId, (tx, ctx) => repo.insertTemplate(tx, ctx, input, firstRunAt(input.schedule))); }
export async function updateTemplateForUser(db: Database, userId: string, id: string, input: UpdateRecurringTemplateRequest) { return withOrganisationTx(db, userId, async (tx, ctx) => { const updated = await repo.updateTemplate(tx, ctx.organisationId, id, input, input.schedule ? firstRunAt(input.schedule) : undefined); if (!updated) throw new HTTPException(404, { message: 'Recurring template not found' }); return updated; }); }
export async function changeStatusForUser(db: Database, userId: string, id: string, action: 'pause' | 'resume' | 'end') { return withOrganisationTx(db, userId, async (tx, ctx) => { const current = await repo.getTemplate(tx, ctx.organisationId, id); if (!current) throw new HTTPException(404, { message: 'Recurring template not found' }); if (action === 'pause' && current.status !== 'active') throw new HTTPException(409, { message: 'Only active schedules can be paused' }); if (action === 'resume' && current.status !== 'paused') throw new HTTPException(409, { message: 'Only paused schedules can be resumed' }); const status = action === 'pause' ? 'paused' : action === 'end' ? 'ended' : 'active'; const next = action === 'end' ? null : current.nextRunAt ? new Date(current.nextRunAt) : firstRunAt(current.schedule); return repo.setStatus(tx, ctx.organisationId, id, status, next); }); }

async function generate(db: Database, template: InternalTemplate, scheduledFor: Date) {
  const payload = occurrencePayload(template.payload, template.schedule, scheduledFor); const key = occurrenceKey(template.id, scheduledFor);
  if (payload.kind === 'invoice') return { document: await createInvoiceForUser(db, template.userId, payload.input as CreateInvoiceRequest, { key, method: 'POST', path: '/api/invoices', requestHash: hashIdempotencyPayload(payload.input) }), delivery: payload.input.status === 'sent' ? 'unavailable' as const : 'not_requested' as const };
  if (payload.kind === 'bill') return { document: await createBillForUser(db, template.userId, payload.input as CreateBillRequest, { key, method: 'POST', path: '/api/bills', requestHash: hashIdempotencyPayload(payload.input) }), delivery: 'not_requested' as const };
  if (payload.kind === 'expense') return { document: await createExpenseForUser(db, template.userId, payload.input as CreateExpenseRequest), delivery: 'not_requested' as const };
  return { document: await createBankTransactionForUser(db, template.userId, payload.input), delivery: 'not_requested' as const };
}

type InternalTemplate = NonNullable<Awaited<ReturnType<typeof repo.getTemplate>>> & { userId: string; organisationId: string };
async function runOne(db: Database, template: InternalTemplate, now: Date): Promise<'succeeded' | 'failed' | 'skipped'> {
  if (!template.nextRunAt) return 'skipped';
  const scheduledFor = new Date(template.nextRunAt); const key = occurrenceKey(template.id, scheduledFor);
  const run = await db.transaction((tx) => repo.claimRun(tx, template.organisationId, template, key, scheduledFor));
  if (!run) return 'skipped';
  let next = nextRunAfter(template.schedule, scheduledFor); const count = template.occurrencesCreated + 1;
  if (template.schedule.occurrenceLimit && count >= template.schedule.occurrenceLimit) next = null;
  try {
    const result = await generate(db, template, scheduledFor);
    await db.transaction(async (tx) => { await repo.succeedRun(tx, run.id, result.document.id, result.delivery); await repo.advanceTemplate(tx, template.organisationId, template.id, scheduledFor, next, count); });
    return 'succeeded';
  } catch (error) {
    await db.transaction((tx) => repo.failRun(tx, run.id, error instanceof Error ? error.message : 'Generation failed', new Date(now.getTime() + 5 * 60_000)));
    return 'failed';
  }
}

export async function runDue(db: Database, now = new Date(), limit = 25, organisationId?: string): Promise<RunRecurringDueResponse> {
  let claimed = 0, succeeded = 0, failed = 0;
  while (claimed < limit) {
    const due = await db.transaction((tx) => repo.dueTemplates(tx, now, 1, organisationId)); if (!due[0]) break;
    const context = await db.transaction((tx) => repo.getExecutionContext(tx, due[0].id));
    if (!context) break;
    const template = { ...due[0], ...context };
    const outcome = await runOne(db, template, now); claimed += 1; if (outcome === 'succeeded') succeeded += 1; if (outcome === 'failed') failed += 1;
    if (outcome !== 'succeeded') break;
  }
  const next = await db.transaction(repo.nextAlarm);
  return { claimed, succeeded, failed, nextAlarmAt: next?.toISOString() ?? null };
}
export async function runDueForUser(db: Database, userId: string, now = new Date(), limit = 25) { const org = await withOrganisationTx(db, userId, async (_tx, ctx) => ctx.organisationId); return runDue(db, now, limit, org); }
