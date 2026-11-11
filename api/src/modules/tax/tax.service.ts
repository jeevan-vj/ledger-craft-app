import { assertAccountingDateOpen, assertAccountingSettingsOpen } from '../accounting/period-lock';
import {
  taxReturnListResponseSchema,
  taxReturnSchema,
  gstReturnRecalculationResponseSchema,
  type GstReturnRecalculationResponse,
  type CreateTaxReturnRequest,
  type FileTaxReturnRequest,
  type ReopenGstReturnRequest,
  type TaxConfigurationDto,
  type TaxReturnDto,
  type TaxReturnListResponse,
  type UpdateTaxReturnRequest,
  type UpsertTaxConfigurationRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './tax.repository';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from '../invoices/idempotency';
import { assertNoFiledGstOverlap, canonicalGstReturnInput, preparationForStoredGst } from './gst-return-validation';
import { gstSettingsInTx } from './gst-settings';
import { decimal, roundMoney } from '../invoices/money';
import { stableGstFingerprint } from './gst-calculation';
import { apiError } from '../../http-error';
import { organisationToday } from '../accounting/organisation-date';

function bindPreparationAudit(data: CreateTaxReturnRequest['returnData'], userId: string): CreateTaxReturnRequest['returnData'] {
  if (!data) return data;
  const now = new Date().toISOString();
  return { ...data,
    ...(data.gstReview ? { gstReview: { ...data.gstReview, reviewedBy: userId, reviewedAt: now } } : {}),
    ...(data.companyIncomeTax ? { companyIncomeTax: { ...data.companyIncomeTax, preparedBy: userId, preparedAt: now } } : {}),
  };
}

export async function getTaxConfigurationForUser(
  db: Database,
  userId: string,
  countryCode?: string,
): Promise<TaxConfigurationDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getActiveConfig(tx, ctx.organisationId, countryCode ?? 'NZ');
    if (existing) return existing;
    return repo.insertDefaultConfig(tx, ctx, { countryCode: countryCode ?? 'NZ', taxRate: '0.15', taxName: 'GST' });
  });
}

export async function upsertTaxConfigurationForUser(
  db: Database,
  userId: string,
  input: UpsertTaxConfigurationRequest,
): Promise<TaxConfigurationDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => { await assertAccountingSettingsOpen(tx, ctx.organisationId); return repo.upsertConfig(tx, ctx, input); });
}

export async function listTaxReturnsForUser(db: Database, userId: string): Promise<TaxReturnListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    taxReturnListResponseSchema.parse({ taxReturns: await repo.listReturns(tx, ctx.organisationId) }),
  );
}

export async function getTaxReturnForUser(db: Database, userId: string, id: string): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getReturn(tx, ctx.organisationId, id);
    if (!row) throw new HTTPException(404, { message: 'Tax return not found' });
    return row;
  });
}

export async function createTaxReturnForUser(
  db: Database,
  userId: string,
  input: CreateTaxReturnRequest,
  scope?: IdempotencyScope,
): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (scope) {
      const replay = await getIdempotencyRecord(tx, ctx, scope);
      if (replay) { assertReplayMatches(replay.requestHash, scope.requestHash); return taxReturnSchema.parse(replay.responseBody); }
    }
    await assertAccountingDateOpen(tx, ctx.organisationId, input.periodStart, input.periodEnd);
    if ((input.returnType ?? 'GST') === 'GST') await assertNoFiledGstOverlap(tx, ctx.organisationId, input.periodStart, input.periodEnd);
    const canonical = (input.returnType ?? 'GST') === 'GST' ? await canonicalGstReturnInput(tx, ctx, input) : input;
    const created = await repo.insertReturn(tx, ctx, { ...canonical, returnData: bindPreparationAudit(canonical.returnData, ctx.userId) });
    if (scope) await insertIdempotencyRecord(tx, ctx, scope, { status: 201, body: created });
    return created;
  });
}

export async function updateTaxReturnForUser(
  db: Database,
  userId: string,
  id: string,
  input: UpdateTaxReturnRequest,
): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getReturn(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Tax return not found' });
    await assertAccountingDateOpen(tx, ctx.organisationId, existing.periodStart, existing.periodEnd);
    if (existing.status !== 'draft') throw new HTTPException(409, { message: 'Filed tax records are immutable; prepare a separate correction instead' });
    if (existing.returnType === 'GST' && input.returnType && input.returnType !== 'GST') throw apiError(422, 'GST_RETURN_TYPE_IMMUTABLE', 'A GST return cannot be converted to another tax type.');
    if (existing.returnType === 'GST' && !existing.returnData?.gstCalculation) throw apiError(409, 'GST_SNAPSHOT_IMMUTABLE', 'This legacy GST draft has no authoritative snapshot. Prepare a new draft; the original record is retained.');
    const merged = { ...existing, ...input, status: 'draft' as const, returnData: input.returnData === undefined ? existing.returnData : input.returnData };
    const canonical = merged.returnType === 'GST' ? await canonicalGstReturnInput(tx, ctx, merged) : input;
    if (existing.returnType === 'GST') {
      if (canonical.returnData?.gstCalculation?.fingerprint !== existing.returnData?.gstCalculation?.fingerprint || (input.irdReference !== undefined && input.irdReference !== existing.irdReference)) {
        throw apiError(409, 'GST_SNAPSHOT_IMMUTABLE', 'Saved GST calculation snapshots are immutable. Prepare a new draft to retain this original calculation and settings.');
      }
      return existing;
    }
    const row = await repo.updateReturn(tx, ctx.organisationId, id, { ...canonical, returnData: bindPreparationAudit(canonical.returnData, ctx.userId) });
    if (!row) throw new HTTPException(404, { message: 'Tax return not found' });
    return row;
  });
}

export async function fileTaxReturnForUser(
  db: Database,
  userId: string,
  id: string,
  input: FileTaxReturnRequest,
): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getReturn(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Tax return not found' });
    if (existing.status !== 'draft') {
      throw new HTTPException(409, { message: 'Only a draft tax return can be recorded as filed' });
    }
    if (existing.returnType === 'GST') {
      if (existing.periodEnd >= await organisationToday(tx, ctx.organisationId)) throw apiError(422, 'GST_PERIOD_NOT_ENDED', 'Only a completed taxable period can be recorded as filed. Save this calculation as a draft until the period has ended.');
      await assertNoFiledGstOverlap(tx, ctx.organisationId, existing.periodStart, existing.periodEnd, existing.id);
      const current = await preparationForStoredGst(tx, ctx, existing);
      const recorded = existing.returnData?.gstCalculation;
      if (!recorded || !current.calculation || current.calculation.fingerprint !== recorded.fingerprint) {
        throw apiError(409, 'GST_CALCULATION_STALE', 'The books changed after this draft was prepared. Recalculate and review before recording it as filed.');
      }
      if (recorded.mappingStatus !== 'supported') throw apiError(422, 'GST_MAPPING_REVIEW_REQUIRED', 'Complete the supported myIR box mapping before recording this return as filed.');
      if (recorded.version === 'gst-ledger-v3' && recorded.roundingReviewRequired && !input.acknowledgeRounding) {
        throw apiError(422, 'GST_ROUNDING_REVIEW_REQUIRED', 'The ledger and the myIR 3/23 form differ by more than $1.00. Review the disclosed rounding line and acknowledge it before recording this return as filed.');
      }
      if (input.acknowledgeRounding) {
        await repo.updateReturn(tx, ctx.organisationId, id, { returnData: { ...existing.returnData, roundingAcknowledgement: { acknowledgedAt: new Date().toISOString(), acknowledgedBy: ctx.userId } } });
      }
    }
    const filed = await repo.fileReturn(tx, ctx.organisationId, id, input.irdReference);
    if (!filed) throw new HTTPException(409, { message: 'Tax return is no longer a draft' });
    return filed;
  });
}

export async function reopenGstReturnForUser(
  db: Database,
  userId: string,
  id: string,
  input: ReopenGstReturnRequest,
): Promise<TaxReturnDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (!['owner', 'admin'].includes(ctx.role)) throw apiError(403, 'FORBIDDEN', 'Only an owner or admin can reopen a filed GST period.');
    const existing = await repo.getReturn(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Tax return not found' });
    if (existing.returnType !== 'GST') throw apiError(422, 'GST_RETURN_REQUIRED', 'Only a GST return can be reopened.');
    if (!['submitted', 'approved'].includes(existing.status) || existing.supersededAt) {
      throw apiError(409, 'GST_RETURN_NOT_FILED', 'Only a filed GST return that is still in force can be reopened.');
    }
    const reopened = await repo.supersedeFiledReturn(tx, ctx, id, input.reason);
    if (!reopened) throw apiError(409, 'GST_RETURN_NOT_FILED', 'Only a filed GST return that is still in force can be reopened.');
    return reopened;
  });
}

export async function recalculateGstReturnForUser(db: Database, userId: string, id: string): Promise<GstReturnRecalculationResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const recorded = await repo.getReturn(tx, ctx.organisationId, id);
    if (!recorded) throw new HTTPException(404, { message: 'Tax return not found' });
    if (recorded.returnType !== 'GST') throw apiError(422, 'GST_RETURN_REQUIRED', 'Only GST returns have a GST source recalculation.');
    const current = await preparationForStoredGst(tx, ctx, recorded);
    const settings = await gstSettingsInTx(tx, ctx.organisationId);
    const currentFigures = { totalSales: current.totalSales, totalPurchases: current.totalPurchases, gstOnSales: current.gstOnSales, gstOnPurchases: current.gstOnPurchases, netGst: current.netGstPosition };
    const difference = Object.fromEntries((['totalSales', 'totalPurchases', 'gstOnSales', 'gstOnPurchases', 'netGst'] as const).map(field => [field, roundMoney(decimal(currentFigures[field]).sub(recorded[field]))]));
    return gstReturnRecalculationResponseSchema.parse({ recorded, current, difference, settingsChanged: stableGstFingerprint(settings) !== stableGstFingerprint(recorded.returnData?.gstCalculation?.settings) });
  });
}

export async function deleteTaxReturnForUser(db: Database, userId: string, id: string): Promise<void> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getReturn(tx, ctx.organisationId, id);
    if (!existing) throw new HTTPException(404, { message: 'Tax return not found' });
    await assertAccountingDateOpen(tx, ctx.organisationId, existing.periodStart, existing.periodEnd);
    if (existing.status !== 'draft') throw new HTTPException(409, { message: 'Filed tax records cannot be deleted; retain the filing history and record a correction separately' });
    if (existing.returnType === 'GST' && existing.returnData?.gstCalculation) throw apiError(409, 'GST_SNAPSHOT_IMMUTABLE', 'Saved GST calculation snapshots are retained for audit. Prepare a new draft or correction instead of deleting the original calculation.');
    const deleted = await repo.deleteReturn(tx, ctx.organisationId, id);
    if (!deleted) throw new HTTPException(404, { message: 'Tax return not found' });
  });
}
