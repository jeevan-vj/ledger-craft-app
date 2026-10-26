import { recurringPayloadSchema, recurringRunSchema, recurringScheduleSchema, recurringTemplateSchema, type CreateRecurringTemplateRequest, type RecurringRunDto, type RecurringTemplateDto, type UpdateRecurringTemplateRequest } from '@ledgercraft/contracts';
import { and, asc, desc, eq, isNotNull, lte, or } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { recurringRuns, recurringTemplates } from '../../db/schema/recurring';

const iso = (value: Date | null) => value?.toISOString() ?? null;
type StoredPayload = Record<string, unknown> & { sourceInvoiceId?: string | null };
const parseStoredPayload = (value: string): StoredPayload => JSON.parse(value) as StoredPayload;
const templateDto = (row: typeof recurringTemplates.$inferSelect): RecurringTemplateDto => {
  const stored = parseStoredPayload(row.payloadJson);
  return recurringTemplateSchema.parse({
    id: row.id, name: row.name, kind: row.kind, status: row.status, payload: recurringPayloadSchema.parse(stored),
    sourceInvoiceId: stored.sourceInvoiceId ?? null, schedule: JSON.parse(row.scheduleJson),
    nextRunAt: iso(row.nextRunAt), lastRunAt: iso(row.lastRunAt), occurrencesCreated: row.occurrencesCreated, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  });
};
const runDto = (row: typeof recurringRuns.$inferSelect): RecurringRunDto => recurringRunSchema.parse({
  id: row.id, templateId: row.templateId, occurrenceKey: row.occurrenceKey, scheduledFor: row.scheduledFor.toISOString(), status: row.status,
  attemptCount: row.attemptCount, generatedType: row.generatedType, generatedId: row.generatedId, deliveryStatus: row.deliveryStatus,
  deliveryMessage: row.deliveryStatus === 'failed' || row.deliveryStatus === 'email_not_configured' ? row.failureReason : null,
  failureReason: row.status === 'failed' ? row.failureReason : null, nextAttemptAt: iso(row.nextAttemptAt), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export async function listTemplates(tx: Database, organisationId: string) { return (await tx.select().from(recurringTemplates).where(eq(recurringTemplates.organisationId, organisationId)).orderBy(asc(recurringTemplates.name))).map(templateDto); }
export async function getTemplate(tx: Database, organisationId: string, id: string) { const [row] = await tx.select().from(recurringTemplates).where(and(eq(recurringTemplates.organisationId, organisationId), eq(recurringTemplates.id, id))); return row ? templateDto(row) : undefined; }
export async function getExecutionContext(tx: Database, id: string) { const [row] = await tx.select({ userId: recurringTemplates.userId, organisationId: recurringTemplates.organisationId }).from(recurringTemplates).where(eq(recurringTemplates.id, id)); return row; }
export async function insertTemplate(tx: Database, ctx: { organisationId: string; userId: string }, input: CreateRecurringTemplateRequest, nextRunAt: Date) {
  const [row] = await tx.insert(recurringTemplates).values({ organisationId: ctx.organisationId, userId: ctx.userId, name: input.name, kind: input.payload.kind, payloadJson: JSON.stringify({ ...input.payload, sourceInvoiceId: input.sourceInvoiceId ?? null }), scheduleJson: JSON.stringify(input.schedule), nextRunAt }).returning();
  return templateDto(row!);
}
export async function updateTemplate(tx: Database, organisationId: string, id: string, input: UpdateRecurringTemplateRequest, nextRunAt?: Date) {
  const patch: Partial<typeof recurringTemplates.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.payload !== undefined || input.sourceInvoiceId !== undefined) {
    const [current] = await tx.select({ payloadJson: recurringTemplates.payloadJson }).from(recurringTemplates)
      .where(and(eq(recurringTemplates.organisationId, organisationId), eq(recurringTemplates.id, id)));
    if (!current) return undefined;
    const stored = parseStoredPayload(current.payloadJson);
    const payload = input.payload ?? recurringPayloadSchema.parse(stored);
    const sourceInvoiceId = input.sourceInvoiceId !== undefined ? input.sourceInvoiceId : stored.sourceInvoiceId ?? null;
    patch.kind = payload.kind;
    patch.payloadJson = JSON.stringify({ ...payload, sourceInvoiceId });
  }
  if (input.schedule !== undefined) { patch.scheduleJson = JSON.stringify(input.schedule); patch.nextRunAt = nextRunAt; }
  const [row] = await tx.update(recurringTemplates).set(patch).where(and(eq(recurringTemplates.organisationId, organisationId), eq(recurringTemplates.id, id))).returning();
  return row ? templateDto(row) : undefined;
}
export async function setStatus(tx: Database, organisationId: string, id: string, status: 'active' | 'paused' | 'ended', nextRunAt: Date | null) {
  const [row] = await tx.update(recurringTemplates).set({ status, nextRunAt, updatedAt: new Date() }).where(and(eq(recurringTemplates.organisationId, organisationId), eq(recurringTemplates.id, id))).returning();
  return row ? templateDto(row) : undefined;
}
export async function listRuns(tx: Database, organisationId: string, templateId?: string) {
  const where = templateId ? and(eq(recurringRuns.organisationId, organisationId), eq(recurringRuns.templateId, templateId)) : eq(recurringRuns.organisationId, organisationId);
  return (await tx.select().from(recurringRuns).where(where).orderBy(desc(recurringRuns.scheduledFor))).map(runDto);
}
export async function dueTemplates(tx: Database, now: Date, limit: number, organisationId?: string) { return (await tx.select().from(recurringTemplates).where(and(organisationId ? eq(recurringTemplates.organisationId, organisationId) : undefined, eq(recurringTemplates.status, 'active'), isNotNull(recurringTemplates.nextRunAt), lte(recurringTemplates.nextRunAt, now))).orderBy(asc(recurringTemplates.nextRunAt)).limit(limit)).map(templateDto); }
export async function claimRun(tx: Database, organisationId: string, template: RecurringTemplateDto, key: string, scheduledFor: Date, now = new Date()) {
  const inserted = await tx.insert(recurringRuns).values({ organisationId, templateId: template.id, occurrenceKey: key, scheduledFor, status: 'running', generatedType: template.kind }).onConflictDoNothing().returning();
  if (inserted[0]) return runDto(inserted[0]);
  const [existing] = await tx.select().from(recurringRuns).where(and(eq(recurringRuns.organisationId, organisationId), eq(recurringRuns.occurrenceKey, key)));
  if (!existing || existing.status !== 'failed' || !existing.nextAttemptAt || existing.nextAttemptAt > now) return null;
  const [retried] = await tx.update(recurringRuns).set({ status: 'running', attemptCount: existing.attemptCount + 1, deliveryStatus: 'not_requested', failureReason: null, nextAttemptAt: null, updatedAt: now }).where(eq(recurringRuns.id, existing.id)).returning();
  return retried ? runDto(retried) : null;
}
export async function succeedRun(tx: Database, runId: string, generatedId: string, deliveryStatus: RecurringRunDto['deliveryStatus'], deliveryMessage: string | null = null) { await tx.update(recurringRuns).set({ status: 'succeeded', generatedId, deliveryStatus, failureReason: deliveryMessage?.slice(0, 500) ?? null, nextAttemptAt: null, updatedAt: new Date() }).where(eq(recurringRuns.id, runId)); }
export async function failRun(tx: Database, runId: string, reason: string, nextAttemptAt: Date, delivery?: { generatedId: string; message: string }) { await tx.update(recurringRuns).set({ status: 'failed', generatedId: delivery?.generatedId, deliveryStatus: delivery ? 'failed' : 'not_requested', failureReason: (delivery?.message ?? reason).slice(0, 500), nextAttemptAt, updatedAt: new Date() }).where(eq(recurringRuns.id, runId)); }
export async function advanceTemplate(tx: Database, organisationId: string, id: string, scheduledFor: Date, nextRunAt: Date | null, count: number) { await tx.update(recurringTemplates).set({ lastRunAt: scheduledFor, nextRunAt, occurrencesCreated: count, status: nextRunAt ? 'active' : 'ended', updatedAt: new Date() }).where(and(eq(recurringTemplates.organisationId, organisationId), eq(recurringTemplates.id, id))); }
export async function nextAlarm(tx: Database) { const [row] = await tx.select({ at: recurringTemplates.nextRunAt }).from(recurringTemplates).where(and(eq(recurringTemplates.status, 'active'), isNotNull(recurringTemplates.nextRunAt))).orderBy(asc(recurringTemplates.nextRunAt)).limit(1); return row?.at ?? null; }
