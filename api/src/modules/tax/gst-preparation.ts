import { gstPreparationResponseSchema, type GstPreparationQuery, type GstPreparationResponse, type GstAdjustmentPreparationRequest, type GstSettingsDto } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { financialReportInTx } from '../reports/reports.service';
import { grossGstDocuments } from './gst-preparation.repository';
import { paymentsBasisGst } from './gst-payments';
import { gstSettingsInTx } from './gst-settings';
import { buildGstCalculationSnapshot } from './gst-calculation';
import { apiError } from '../../http-error';
import { gstSourceClassificationInTx } from './gst-classification';
import { gstRegistrationExclusions } from './gst-registration.repository';

export type GstCalculationOptions = { settingsOverride?: GstSettingsDto; allowStaleClassificationReview?: boolean };
type Context = { organisationId: string; userId: string };

function sourceReviewRequirement(value: unknown): GstPreparationResponse {
  const response = gstPreparationResponseSchema.parse(value);
  const negativeSource = [response.totalSales, response.totalPurchases, response.gstOnSales, response.gstOnPurchases].some(amount => decimal(amount).compare(0) < 0);
  return negativeSource ? { ...response, requiresReview: true } : response;
}

async function invoiceFigures(tx: Database, organisationId: string, period: GstPreparationQuery, excluded?: ReadonlySet<string>) {
    const report = await financialReportInTx(tx, organisationId, { ...period, basis: 'accrual', baseCurrency: 'NZD' }, { gstExcludedJournalIds: excluded });
    const documents = await grossGstDocuments(tx, organisationId, period, excluded);
    const total = (rows: Array<{ amount: string }>) => roundMoney(rows.reduce((sum, row) => sum.add(row.amount), decimal(0)));
    return {
      totalSales: total(documents.sales), totalPurchases: total(documents.purchases),
      gstOnSales: report.taxSummary.outputGst, gstOnPurchases: report.taxSummary.inputGst,
      netGstPosition: report.taxSummary.netGst,
      warnings: [...report.taxSummary.warnings, ...(documents.hasReversals
        ? ['This period includes cancellation, credit-note or expense reversal movements. Review the signed totals and GST adjustments before filing.'] : [])],
    };
}

async function audited(tx: Database, ctx: Context, figures: GstPreparationResponse, settings: GstSettingsDto) {
  const parsed = sourceReviewRequirement(figures);
  const calculation = await buildGstCalculationSnapshot(tx, ctx, parsed, settings);
  return gstPreparationResponseSchema.parse({ ...parsed, calculation });
}

export async function gstPreparationInTx(tx: Database, ctx: Context, period: GstPreparationQuery, options?: GstCalculationOptions): Promise<GstPreparationResponse> {
  const settings = options?.settingsOverride ?? await gstSettingsInTx(tx, ctx.organisationId);
  if (settings.gstRegistrationStatus === 'not_registered') throw apiError(422, 'GST_NOT_REGISTERED', 'This business is not GST registered. Review registration before preparing a GST return.');
  const registered = settings.configured && settings.gstRegistrationStatus === 'registered';
  const basis = registered ? settings.gstAccountingBasis! : period.basis ?? 'invoice';
  if (registered && period.basis && period.basis !== basis) throw apiError(422, 'GST_BASIS_MISMATCH', 'Use the saved IRD accounting basis. Review GST settings explicitly before changing it.');
  const effectiveFrom = registered && settings.gstRegisteredFrom && settings.gstRegisteredFrom > period.from ? settings.gstRegisteredFrom : period.from;
  const effectivePeriod = { ...period, from: effectiveFrom, basis };
  const registration = registered && settings.gstRegisteredFrom ? await gstRegistrationExclusions(tx, ctx.organisationId, settings.gstRegisteredFrom) : undefined;
  const warnings = registered ? [] : ['Preview only: IRD registration, basis, frequency and effective date are not confirmed. Confirm GST settings before saving or filing.'];
  if (effectiveFrom !== period.from) warnings.push('Movements before the confirmed GST registration date are excluded. Review any separate pre-registration adjustments with your accountant.');
  let figures: { totalSales: string; totalPurchases: string; gstOnSales: string; gstOnPurchases: string; warnings: string[]; requiresReview?: boolean };
  if (effectiveFrom > period.to) figures = { totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', warnings: [] };
  else if (basis === 'invoice') figures = await invoiceFigures(tx, ctx.organisationId, effectivePeriod, registration?.journalIds);
  else {
    const paid = await paymentsBasisGst(tx, ctx.organisationId, effectivePeriod, registered ? settings.gstRegisteredFrom ?? undefined : undefined, registration);
    if (basis === 'payments') figures = paid;
    else {
      const invoiced = await invoiceFigures(tx, ctx.organisationId, effectivePeriod, registration?.journalIds);
      figures = { totalSales: invoiced.totalSales, gstOnSales: invoiced.gstOnSales, totalPurchases: paid.totalPurchases, gstOnPurchases: paid.gstOnPurchases,
        warnings: [...invoiced.warnings, ...paid.warnings, 'Hybrid basis uses invoice-date sales and payments-date purchases.'], requiresReview: paid.requiresReview };
    }
  }
  const classification = effectiveFrom > period.to
    ? { zeroRatedSales: '0.00', exemptSales: '0.00', unclassifiedSales: '0.00', claimablePurchases: '0.00', salesClassificationSupported: true, warnings: [] }
    : await gstSourceClassificationInTx(tx, ctx.organisationId, effectivePeriod, basis, registered ? settings.gstRegisteredFrom ?? undefined : undefined);
  return audited(tx, ctx, sourceReviewRequirement({ ...period, basis, baseCurrency: 'NZD', ...figures,
    zeroRatedSales: classification.zeroRatedSales, exemptSales: classification.exemptSales, unclassifiedSales: classification.unclassifiedSales,
    salesClassificationSupported: classification.salesClassificationSupported,
    ...(classification.claimablePurchases !== null ? { claimablePurchases: classification.claimablePurchases } : {}),
    netGstPosition: roundMoney(decimal(figures.gstOnSales).sub(figures.gstOnPurchases)),
    warnings: [...new Set([...warnings, ...figures.warnings, ...classification.warnings])],
    ...(!registered || classification.warnings.length > 0 ? { requiresReview: true } : {}),
  }), settings);
}

export async function gstPreparationForUser(db: Database, userId: string, period: GstPreparationQuery): Promise<GstPreparationResponse> {
  return withOrganisationTx(db, userId, (tx, ctx) => gstPreparationInTx(tx, ctx, period));
}

export async function reviewedGstPreparationInTx(tx: Database, ctx: Context, input: GstAdjustmentPreparationRequest, options?: GstCalculationOptions): Promise<GstPreparationResponse> {
  // Read the books again for this review. Signed adjustments never rewrite the
  // source ledger and are retained with documentary references in the draft.
  const preparation = await gstPreparationInTx(tx, ctx, { from: input.from, to: input.to, basis: input.basis }, options);
  const adjustment = (kind: 'output' | 'input') => input.adjustments.filter(row => row.kind === kind).reduce((sum, row) => sum.add(row.amount), decimal(0));
  const grossAdjustment = (kind: 'output' | 'input') => input.adjustments.filter(row => row.kind === kind).reduce((sum, row) => sum.add(row.grossAdjustment ?? '0'), decimal(0));
  const output = decimal(preparation.gstOnSales).add(adjustment('output'));
  const purchases = decimal(preparation.gstOnPurchases).add(adjustment('input'));
  const unclassified = preparation.unclassifiedSales ?? '0.00';
  const classification = input.salesClassificationReview;
  const classificationStale = classification !== undefined && decimal(classification.zeroRatedSales).add(classification.exemptSales).compare(unclassified) !== 0;
  if ((decimal(unclassified).compare(0) !== 0 && !classification) || classificationStale) {
    if (!options?.allowStaleClassificationReview) throw apiError(422, 'GST_SALES_CLASSIFICATION_REQUIRED', 'Explicitly classify the full untaxed sales amount as zero-rated or exempt using reviewed source evidence.');
  }
  const settings = options?.settingsOverride ?? await gstSettingsInTx(tx, ctx.organisationId);
  return audited(tx, ctx, sourceReviewRequirement({ ...preparation,
    totalSales: roundMoney(decimal(preparation.totalSales).add(grossAdjustment('output'))), totalPurchases: roundMoney(decimal(preparation.totalPurchases).add(grossAdjustment('input'))),
    gstOnSales: roundMoney(output), gstOnPurchases: roundMoney(purchases), netGstPosition: roundMoney(output.sub(purchases)),
    ...(classification && !classificationStale ? {
      zeroRatedSales: roundMoney(decimal(preparation.zeroRatedSales ?? '0').add(classification.zeroRatedSales)),
      exemptSales: roundMoney(decimal(preparation.exemptSales ?? '0').add(classification.exemptSales)),
    } : {}),
    ...(classificationStale ? { salesClassificationSupported: false, requiresReview: true } : {}),
    ...(preparation.claimablePurchases !== undefined ? { claimablePurchases: roundMoney(decimal(preparation.claimablePurchases).add(grossAdjustment('input'))) } : {}),
    review: { confirmed: true, reviewedAt: new Date().toISOString(), reviewedBy: ctx.userId, adjustments: input.adjustments, unadjustedGstOnSales: preparation.gstOnSales, unadjustedGstOnPurchases: preparation.gstOnPurchases, unadjustedTotalSales: preparation.totalSales, unadjustedTotalPurchases: preparation.totalPurchases,
      ...(input.salesClassificationReview ? { salesClassificationReview: input.salesClassificationReview } : {}),
    },
    warnings: [...preparation.warnings, ...(classificationStale ? ['The recorded zero-rated/exempt classification no longer matches current source totals. This read-only comparison needs a fresh classification before any new filing.'] : []), 'Reviewed preparation adjustments change this return only, not posted ledger balances. Do not duplicate credit notes already included in the books. Confirm adjustment treatment before filing.'],
  }), settings);
}

export async function reviewedGstPreparationForUser(db: Database, userId: string, input: GstAdjustmentPreparationRequest): Promise<GstPreparationResponse> {
  return withOrganisationTx(db, userId, (tx, ctx) => reviewedGstPreparationInTx(tx, ctx, input));
}
