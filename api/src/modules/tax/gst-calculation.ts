import { gstCalculationSnapshotSchema, gstCalculationSourceTypes, type GstCalculationSnapshot, type GstPreparationResponse, type GstSettingsDto } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { hashIdempotencyPayload } from '../invoices/idempotency';
import { decimal, roundMoney } from '../invoices/money';
import { gstCalculationSources } from './gst-calculation.repository';

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
  const zeroRated = preparation.zeroRatedSales ?? '0.00';
  const sales = decimal(preparation.totalSales).sub(preparation.exemptSales ?? '0.00');
  const reviewedClassification = review?.salesClassificationReview;
  const classificationSupported = preparation.salesClassificationSupported !== false
    && (decimal(preparation.unclassifiedSales ?? '0.00').compare(0) === 0 || (reviewedClassification !== undefined
      && decimal(reviewedClassification.zeroRatedSales).add(reviewedClassification.exemptSales).compare(preparation.unclassifiedSales ?? '0.00') === 0));
  const taxableSales = sales.sub(zeroRated);
  const box8 = roundMoney(taxableSales.mul('3').div('23'));
  const box12 = preparation.claimablePurchases == null ? undefined : roundMoney(decimal(preparation.claimablePurchases).mul('3').div('23'));
  const warnings = [...preparation.warnings];
  if (!classificationSupported) warnings.push('myIR sales boxes5–9 are omitted until the untaxed source sales have a supported zero-rated/exempt classification. No artificial GST adjustment has been inferred.');
  if (preparation.claimablePurchases == null) warnings.push('A supported claimable-purchases gross amount is not available for myIR box11. Review the source evidence before filing; no box11 amount has been invented from GST.');
  const figures = { totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases, gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition };
  const body = {
    version: 'gst-ledger-v2' as const, period: { from: preparation.from, to: preparation.to, basis: preparation.basis }, settings, figures, sources, sourceIds, sourceCounts,
    myIrBoxes: { ...(classificationSupported ? { '5': roundMoney(sales), '6': roundMoney(zeroRated), '7': roundMoney(taxableSales),
      '8': box8, '9': roundMoney(decimal(preparation.gstOnSales).sub(box8)) } : {}), '10': preparation.gstOnSales,
      ...(preparation.claimablePurchases == null ? {} : { '11': preparation.claimablePurchases }),
      ...(box12 === undefined ? {} : { '12': box12, '13': roundMoney(decimal(preparation.gstOnPurchases).sub(box12)) }), '14': preparation.gstOnPurchases, '15': preparation.netGstPosition },
    mappingStatus: box12 === undefined || !classificationSupported ? 'requires_confirmation' : 'supported',
    warnings, requiresReview: Boolean(preparation.requiresReview || preparation.claimablePurchases == null || !classificationSupported),
    result: decimal(preparation.netGstPosition).compare(0) > 0 ? 'payable' : decimal(preparation.netGstPosition).compare(0) < 0 ? 'refund' : 'nil',
  };
  const fingerprint = stableGstFingerprint({ organisationId: ctx.organisationId, ...body, review: review ? { adjustments: review.adjustments, salesClassificationReview: review.salesClassificationReview ?? null } : null });
  return gstCalculationSnapshotSchema.parse({ ...body, fingerprint, calculatedAt: new Date().toISOString() });
}
