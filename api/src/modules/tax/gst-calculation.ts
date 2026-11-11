import { gstCalculationSnapshotSchema, gstCalculationSourceTypes, type GstCalculationSnapshot, type GstPreparationResponse, type GstSettingsDto } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { hashIdempotencyPayload } from '../invoices/idempotency';
import { decimal, roundMoney } from '../invoices/money';
import { gstCalculationSources } from './gst-calculation.repository';
import { customsGstInPeriod, normalizeGstAdjustment, roundingDifference, roundingNeedsAcknowledgement, sumAdjustmentBox } from './gst-return-boxes';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
export function stableGstFingerprint(value: unknown) { return hashIdempotencyPayload(stable(value)); }

export async function buildGstCalculationSnapshot(tx: Database, ctx: { organisationId: string; userId: string }, preparation: GstPreparationResponse, settings: GstSettingsDto): Promise<GstCalculationSnapshot> {
  const sources = await gstCalculationSources(tx, ctx.organisationId, preparation.to);
  const sourceIds = Object.fromEntries(gstCalculationSourceTypes.map(type => [type, sources.filter(source => source.type === type).map(source => source.id)]));
  const sourceCounts = Object.fromEntries(gstCalculationSourceTypes.map(type => [type, sources.filter(source => source.type === type).length]));
  const review = preparation.review;
  const adjustments = (review?.adjustments ?? []).map(normalizeGstAdjustment);
  const customsGst = customsGstInPeriod(sources, preparation.from, preparation.to);
  const zeroRated = preparation.zeroRatedSales ?? '0.00';
  const sales = decimal(preparation.totalSales).sub(preparation.exemptSales ?? '0.00');
  const reviewedClassification = review?.salesClassificationReview;
  const classificationSupported = preparation.salesClassificationSupported !== false
    && (decimal(preparation.unclassifiedSales ?? '0.00').compare(0) === 0 || (reviewedClassification !== undefined
      && decimal(reviewedClassification.zeroRatedSales).add(reviewedClassification.exemptSales).compare(preparation.unclassifiedSales ?? '0.00') === 0));
  const taxableSales = sales.sub(zeroRated);
  const outputGross = adjustments.filter((row) => row.kind === 'output').reduce((sum, row) => sum.add(row.grossAdjustment ?? '0'), decimal(0));
  const inputGross = adjustments.filter((row) => row.kind === 'input').reduce((sum, row) => sum.add(row.grossAdjustment ?? '0'), decimal(0));
  const unadjustedOutput = decimal(review?.unadjustedGstOnSales ?? preparation.gstOnSales);
  const unadjustedInput = decimal(review?.unadjustedGstOnPurchases ?? preparation.gstOnPurchases);
  const outputRounding = classificationSupported ? roundingDifference(roundMoney(unadjustedOutput), roundMoney(taxableSales.sub(outputGross).mul('3').div('23'))) : '0.00';
  const box8 = classificationSupported ? roundMoney(taxableSales.mul('3').div('23')) : undefined;
  const box9 = classificationSupported ? sumAdjustmentBox(adjustments, 'output') : undefined;
  const box12 = preparation.claimablePurchases == null ? undefined : roundMoney(decimal(preparation.claimablePurchases).mul('3').div('23'));
  const inputRounding = preparation.claimablePurchases == null ? '0.00' : roundingDifference(roundMoney(unadjustedInput.sub(customsGst)), roundMoney(decimal(preparation.claimablePurchases).sub(inputGross).mul('3').div('23')));
  const box13 = box12 === undefined ? undefined : roundMoney(decimal(sumAdjustmentBox(adjustments, 'input')).add(customsGst));
  const box10 = box8 !== undefined && box9 !== undefined ? roundMoney(decimal(box8).add(box9)) : preparation.gstOnSales;
  const box14 = box12 !== undefined && box13 !== undefined ? roundMoney(decimal(box12).add(box13)) : preparation.gstOnPurchases;
  const box15 = box8 !== undefined && box12 !== undefined ? roundMoney(decimal(box10).sub(box14)) : preparation.netGstPosition;
  const roundingReviewRequired = roundingNeedsAcknowledgement(outputRounding, inputRounding);
  const warnings = [...preparation.warnings];
  if (!classificationSupported) warnings.push('myIR sales boxes5–9 are omitted until the untaxed source sales have a supported zero-rated/exempt classification. No artificial GST adjustment has been inferred.');
  if (preparation.claimablePurchases == null) warnings.push('A supported claimable-purchases gross amount is not available for myIR box11. Review the source evidence before filing; no box11 amount has been invented from GST.');
  if (decimal(outputRounding).compare(0) !== 0 || decimal(inputRounding).compare(0) !== 0) warnings.push(`Ledger GST differs from the myIR 3/23 form by output ${outputRounding} and input ${inputRounding}. This rounding is disclosed separately and is not included in Box 9 or Box 13.`);
  if (roundingReviewRequired) warnings.push('The rounding difference is over $1.00. Review and acknowledge it before recording this return as filed.');
  const figures = { totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases, gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition };
  const body = {
    version: 'gst-ledger-v3' as const, period: { from: preparation.from, to: preparation.to, basis: preparation.basis }, settings, figures, sources, sourceIds, sourceCounts,
    customsGst, rounding: { output: outputRounding, input: inputRounding }, roundingReviewRequired,
    myIrBoxes: { ...(classificationSupported ? { '5': roundMoney(sales), '6': roundMoney(zeroRated), '7': roundMoney(taxableSales), '8': box8, '9': box9 } : {}), '10': box10,
      ...(preparation.claimablePurchases == null ? {} : { '11': preparation.claimablePurchases }),
      ...(box12 === undefined || box13 === undefined ? {} : { '12': box12, '13': box13 }), '14': box14, '15': box15 },
    mappingStatus: box12 === undefined || !classificationSupported ? 'requires_confirmation' : 'supported',
    warnings, requiresReview: Boolean(preparation.requiresReview || preparation.claimablePurchases == null || !classificationSupported),
    result: decimal(preparation.netGstPosition).compare(0) > 0 ? 'payable' : decimal(preparation.netGstPosition).compare(0) < 0 ? 'refund' : 'nil',
  };
  const fingerprint = stableGstFingerprint({ organisationId: ctx.organisationId, ...body, review: review ? { adjustments: review.adjustments, salesClassificationReview: review.salesClassificationReview ?? null } : null });
  return gstCalculationSnapshotSchema.parse({ ...body, fingerprint, calculatedAt: new Date().toISOString() });
}
