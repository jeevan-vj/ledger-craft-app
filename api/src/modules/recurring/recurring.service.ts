import type { CreateRecurringTemplateRequest, RecurringTemplateDto, RecurringPreviewRequest, RecurringPreviewResponse, RunRecurringDueResponse, UpdateRecurringTemplateRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import type { InvoiceMailer } from '../invoices/mailer';
import * as repo from './recurring.repository';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from '../invoices/idempotency';
import { generateOccurrence, DeliveryFailure, ScheduledActorUnavailable, type RecurringExecutionAuthorizer } from './recurring.generate';
export type { RecurringExecutionAuthorizer } from './recurring.generate';
import { firstRunAt, nextRunAfter, occurrenceKey } from './schedule';

const dateOnly = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
export async function listTemplatesForUser(db: Database, userId: string) { return withOrganisationTx(db, userId, (tx, ctx) => repo.listTemplates(tx, ctx.organisationId)); }
export async function listRunsForUser(db: Database, userId: string, templateId?: string) { return withOrganisationTx(db, userId, (tx, ctx) => repo.listRuns(tx, ctx.organisationId, templateId)); }
export async function createTemplateForUser(db: Database, userId: string, input: CreateRecurringTemplateRequest, idempotency?: IdempotencyScope) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) { assertReplayMatches(existing.requestHash, idempotency.requestHash); return existing.responseBody as RecurringTemplateDto; }
    }
    const result = await repo.insertTemplate(tx, ctx, input, firstRunAt(input.schedule));
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: result });
    return result;
  });
}
export async function updateTemplateForUser(db: Database, userId: string, id: string, input: UpdateRecurringTemplateRequest, idempotency?: IdempotencyScope) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) { assertReplayMatches(existing.requestHash, idempotency.requestHash); return existing.responseBody as RecurringTemplateDto; }
    }
    const updated = await repo.updateTemplate(tx, ctx.organisationId, id, input, input.schedule ? firstRunAt(input.schedule) : undefined);
    if (!updated) throw new HTTPException(404, { message: 'Recurring template not found' });
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 200, body: updated });
    return updated;
  });
}
export async function changeStatusForUser(db: Database, userId: string, id: string, action: 'pause' | 'resume' | 'end') { return withOrganisationTx(db, userId, async (tx, ctx) => { const current = await repo.getTemplate(tx, ctx.organisationId, id); if (!current) throw new HTTPException(404, { message: 'Recurring template not found' }); if (action === 'pause' && current.status !== 'active') throw new HTTPException(409, { message: 'Only active schedules can be paused' }); if (action === 'resume' && current.status !== 'paused') throw new HTTPException(409, { message: 'Only paused schedules can be resumed' }); const status = action === 'pause' ? 'paused' : action === 'end' ? 'ended' : 'active'; const next = action === 'end' ? null : current.nextRunAt ? new Date(current.nextRunAt) : firstRunAt(current.schedule); return repo.setStatus(tx, ctx.organisationId, id, status, next); }); }

export function previewOccurrences(input: RecurringPreviewRequest): RecurringPreviewResponse {
  const occurrences: RecurringPreviewResponse['occurrences'] = [];
  const maximum = Math.min(input.count, input.schedule.occurrenceLimit ?? input.count);
  let current: Date | null = firstRunAt(input.schedule);
  while (current && occurrences.length < maximum) {
    const localDate = dateOnly(current, input.schedule.timezone);
    if (input.schedule.endDate && localDate > input.schedule.endDate) break;
    occurrences.push({ runAt: current.toISOString(), localDate });
    current = nextRunAfter(input.schedule, current);
  }
  return { occurrences };
}

type InternalTemplate = NonNullable<Awaited<ReturnType<typeof repo.getTemplate>>> & { userId: string; organisationId: string };
async function runOne(db: Database, template: InternalTemplate, now: Date, mailer?: InvoiceMailer, authorizer?: RecurringExecutionAuthorizer): Promise<'succeeded' | 'failed' | 'skipped'> {
  if (!template.nextRunAt) return 'skipped';
  const scheduledFor = new Date(template.nextRunAt); const key = occurrenceKey(template.id, scheduledFor);
  const run = await db.transaction((tx) => repo.claimRun(tx, template.organisationId, template, key, scheduledFor, now));
  if (!run) return 'skipped';
  let next = nextRunAfter(template.schedule, scheduledFor); const count = template.occurrencesCreated + 1;
  if (template.schedule.occurrenceLimit && count >= template.schedule.occurrenceLimit) next = null;
  try {
    const result = await generateOccurrence(db, template, scheduledFor, mailer, authorizer);
    await db.transaction(async (tx) => { await repo.succeedRun(tx, run.id, result.document.id, result.delivery, result.deliveryMessage); await repo.advanceTemplate(tx, template.organisationId, template.id, scheduledFor, next, count); });
    return 'succeeded';
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Generation failed';
    if (error instanceof ScheduledActorUnavailable) await db.transaction(tx => repo.setStatus(tx, template.organisationId, template.id, 'paused', scheduledFor));
    await db.transaction((tx) => repo.failRun(tx, run.id, reason, new Date(now.getTime() + 5 * 60_000), error instanceof DeliveryFailure || (error instanceof ScheduledActorUnavailable && error.generatedId) ? { generatedId: error.generatedId!, message: reason } : undefined));
    return 'failed';
  }
}

export async function runDue(db: Database, now = new Date(), limit = 25, organisationId?: string, mailer?: InvoiceMailer, authorizer?: RecurringExecutionAuthorizer): Promise<RunRecurringDueResponse> {
  let claimed = 0, succeeded = 0, failed = 0;
  while (claimed < limit) {
    const due = await db.transaction((tx) => repo.dueTemplates(tx, now, 1, organisationId)); if (!due[0]) break;
    const context = await db.transaction((tx) => repo.getExecutionContext(tx, due[0].id));
    if (!context) break;
    const template = { ...due[0], ...context };
    const outcome = await runOne(db, template, now, mailer, authorizer); claimed += 1; if (outcome === 'succeeded') succeeded += 1; if (outcome === 'failed') failed += 1;
    if (outcome !== 'succeeded') break;
  }
  const next = await db.transaction(repo.nextAlarm);
  const retryAt = failed > 0 ? new Date(now.getTime() + 5 * 60_000) : null;
  return { claimed, succeeded, failed, nextAlarmAt: (retryAt ?? next)?.toISOString() ?? null };
}
export async function runDueForUser(db: Database, userId: string, now = new Date(), limit = 25, mailer?: InvoiceMailer, authorizer?: RecurringExecutionAuthorizer) { const org = await withOrganisationTx(db, userId, async (_tx, ctx) => ctx.organisationId); return runDue(db, now, limit, org, mailer, authorizer); }
