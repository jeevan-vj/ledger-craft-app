import {
  gstPeriodCorrectionListSchema,
  gstPeriodCorrectionSchema,
  type CreateGstCorrectionRequest,
  type GstPeriodCorrection,
  type ResolveGstCorrectionRequest,
} from '@ledgercraft/contracts';
import { generateGstPeriods } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from '../invoices/idempotency';
import { GST_CORRECTION_AMEND_GUIDANCE } from './gst-correction-limit';
import {
  correctionSourceDate,
  getCorrection,
  inForceFiledReturns,
  insertCorrection,
  pendingDuplicate,
  resolveCorrection,
  sourceApplies,
} from './gst-correction.repository';
import { gstPreparationInTx } from './gst-preparation';
import { gstSettingsInTx } from './gst-settings';

function addMonths(day: string, months: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

async function openPeriodAfter(tx: Database, ctx: { organisationId: string; userId: string }, originalEnd: string) {
  const settings = await gstSettingsInTx(tx, ctx.organisationId);
  if (!settings.configured || !settings.gstRegisteredFrom || !settings.gstFilingFrequency || settings.gstPeriodAnchor == null) {
    throw apiError(422, 'GST_SETTINGS_REQUIRED', 'Confirm the registered GST settings before recording a prior-period correction.');
  }
  const filed = await inForceFiledReturns(tx, ctx.organisationId);
  const periods = generateGstPeriods(settings, addMonths(originalEnd, 36));
  const target = periods.find((period) => period.periodStart > originalEnd && !filed.some((row) => row.periodStart === period.periodStart && row.periodEnd === period.periodEnd));
  if (!target) throw apiError(422, 'GST_CORRECTION_NO_OPEN_PERIOD', 'There is no later open GST period to carry this correction into.');
  return target;
}

export async function recordGstCorrectionForUser(db: Database, userId: string, input: CreateGstCorrectionRequest, idempotency?: IdempotencyScope): Promise<GstPeriodCorrection> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) { assertReplayMatches(existing.requestHash, idempotency.requestHash); return gstPeriodCorrectionSchema.parse(existing.responseBody); }
    }
    const filed = await inForceFiledReturns(tx, ctx.organisationId);
    const original = filed.find((row) => row.periodStart === input.originalPeriodStart && row.periodEnd === input.originalPeriodEnd);
    if (!original) throw apiError(409, 'GST_CORRECTION_PERIOD_NOT_FILED', 'A prior-period correction can only refer to a filed GST period that is still in force.');
    const source = await correctionSourceDate(tx, ctx.organisationId, original.basis, input.sourceType, input.sourceId);
    if (!source) throw apiError(404, 'GST_CORRECTION_SOURCE_NOT_FOUND', 'That transaction is not in this company.');
    if (!source.date) throw apiError(422, 'GST_CORRECTION_SOURCE_PERIOD', 'That transaction is not claimed in a GST period yet.');
    if (!sourceApplies(original.basis, source)) {
      throw apiError(422, 'GST_CORRECTION_SOURCE_BASIS', `On ${original.basis} basis that transaction is not a GST date for the filed return. Link the document the return actually used.`);
    }
    if (source.date < original.periodStart || source.date > original.periodEnd) {
      throw apiError(422, 'GST_CORRECTION_SOURCE_PERIOD', `That transaction is dated ${source.date}, outside the filed period ${original.periodStart} to ${original.periodEnd}.`);
    }
    const target = await openPeriodAfter(tx, ctx, original.periodEnd);
    const duplicate = await pendingDuplicate(tx, ctx.organisationId, {
      originalTaxReturnId: original.id, sourceType: input.sourceType, sourceId: input.sourceId, kind: input.kind, action: input.action, amount: input.amount,
    });
    if (duplicate) throw apiError(409, 'GST_CORRECTION_DUPLICATE', 'This prior-period correction is already recorded for that transaction. It is included once.');
    const saved = await insertCorrection(tx, ctx, {
      originalTaxReturnId: original.id, originalPeriodStart: original.periodStart, originalPeriodEnd: original.periodEnd,
      targetPeriodStart: target.periodStart, targetPeriodEnd: target.periodEnd,
      sourceType: input.sourceType, sourceId: input.sourceId, action: input.action, kind: input.kind, amount: input.amount, reason: input.reason,
    });
    const preparation = await gstPreparationInTx(tx, ctx, { from: target.periodStart, to: target.periodEnd });
    const match = preparation.priorPeriodCorrections?.find((row) => row.id === saved.id);
    if (!match) throw apiError(409, 'GST_CORRECTION_UNAVAILABLE', 'The correction was recorded but could not be placed on the next open GST period.');
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: match.status === 'over_limit' ? 422 : 201, body: match });
    return match;
  });
}

export async function listGstCorrectionsForUser(db: Database, userId: string, from: string, to: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const preparation = await gstPreparationInTx(tx, ctx, { from, to });
    return gstPeriodCorrectionListSchema.parse({ corrections: preparation.priorPeriodCorrections ?? [] });
  });
}

export async function resolveGstCorrectionForUser(db: Database, userId: string, id: string, input: ResolveGstCorrectionRequest): Promise<GstPeriodCorrection> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await getCorrection(tx, ctx.organisationId, id);
    if (!existing) throw apiError(404, 'GST_CORRECTION_NOT_FOUND', 'That prior-period correction is not in this company.');
    if (existing.status !== 'pending') throw apiError(409, 'GST_CORRECTION_NOT_PENDING', 'Only a pending prior-period correction can be marked for amendment in myIR.');
    const resolved = await resolveCorrection(tx, ctx, id, input.reason);
    if (!resolved) throw apiError(409, 'GST_CORRECTION_NOT_PENDING', 'Only a pending prior-period correction can be marked for amendment in myIR.');
    return gstPeriodCorrectionSchema.parse({
      id: resolved.id, originalTaxReturnId: resolved.originalTaxReturnId, originalPeriodStart: resolved.originalPeriodStart, originalPeriodEnd: resolved.originalPeriodEnd,
      targetPeriodStart: resolved.targetPeriodStart, targetPeriodEnd: resolved.targetPeriodEnd, sourceType: resolved.sourceType, sourceId: resolved.sourceId,
      action: resolved.action, kind: resolved.kind, amount: resolved.amount, reason: resolved.reason, status: 'resolved', carryForward: 'not_applicable',
      netDiscrepancy: '0.00', limit: '0.00', resolution: 'amend_in_myir', guidance: GST_CORRECTION_AMEND_GUIDANCE, createdAt: resolved.createdAt.toISOString(),
    });
  });
}
