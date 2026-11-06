import { gstPreparationResponseSchema, type GstPreparationQuery, type GstPreparationResponse, type GstAdjustmentPreparationRequest } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { financialReportInTx } from '../reports/reports.service';
import { grossGstDocuments } from './gst-preparation.repository';
import { paymentsBasisGst } from './gst-payments';

function sourceReviewRequirement(value: unknown): GstPreparationResponse {
  const response = gstPreparationResponseSchema.parse(value);
  const negativeSource = [response.totalSales, response.totalPurchases, response.gstOnSales, response.gstOnPurchases].some(amount => decimal(amount).compare(0) < 0);
  return negativeSource ? { ...response, requiresReview: true } : response;
}

export async function gstPreparationForUser(db: Database, userId: string, period: GstPreparationQuery): Promise<GstPreparationResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (period.basis === 'payments') {
      const figures = await paymentsBasisGst(tx, ctx.organisationId, period);
      return sourceReviewRequirement({ ...period, basis: 'payments', baseCurrency: 'NZD', ...figures, netGstPosition: roundMoney(decimal(figures.gstOnSales).sub(figures.gstOnPurchases)) });
    }
    const report = await financialReportInTx(tx, ctx.organisationId, { ...period, basis: 'accrual', baseCurrency: 'NZD' });
    const documents = await grossGstDocuments(tx, ctx.organisationId, period);
    const total = (rows: Array<{ amount: string }>) => roundMoney(rows.reduce((sum, row) => sum.add(row.amount), decimal(0)));
    return sourceReviewRequirement({
      ...period, basis: 'invoice', baseCurrency: 'NZD',
      totalSales: total(documents.sales), totalPurchases: total(documents.purchases),
      gstOnSales: report.taxSummary.outputGst, gstOnPurchases: report.taxSummary.inputGst,
      netGstPosition: report.taxSummary.netGst,
      warnings: [...report.taxSummary.warnings, ...(documents.hasReversals
        ? ['This period includes cancellation, credit-note or expense reversal movements. Review the signed totals and GST adjustments before filing.'] : [])],
    });
  });
}

export async function reviewedGstPreparationForUser(db: Database, userId: string, input: GstAdjustmentPreparationRequest): Promise<GstPreparationResponse> {
  // Read the books again for this review. Signed adjustments never rewrite the
  // source ledger and are retained with documentary references in the draft.
  const preparation = await gstPreparationForUser(db, userId, { from: input.from, to: input.to, basis: input.basis });
  const adjustment = (kind: 'output' | 'input') => input.adjustments.filter(row => row.kind === kind).reduce((sum, row) => sum.add(row.amount), decimal(0));
  const grossAdjustment = (kind: 'output' | 'input') => input.adjustments.filter(row => row.kind === kind).reduce((sum, row) => sum.add(row.grossAdjustment ?? '0'), decimal(0));
  const output = decimal(preparation.gstOnSales).add(adjustment('output'));
  const purchases = decimal(preparation.gstOnPurchases).add(adjustment('input'));
  return sourceReviewRequirement({ ...preparation,
    totalSales: roundMoney(decimal(preparation.totalSales).add(grossAdjustment('output'))), totalPurchases: roundMoney(decimal(preparation.totalPurchases).add(grossAdjustment('input'))),
    gstOnSales: roundMoney(output), gstOnPurchases: roundMoney(purchases), netGstPosition: roundMoney(output.sub(purchases)),
    review: { confirmed: true, reviewedAt: new Date().toISOString(), reviewedBy: userId, adjustments: input.adjustments, unadjustedGstOnSales: preparation.gstOnSales, unadjustedGstOnPurchases: preparation.gstOnPurchases, unadjustedTotalSales: preparation.totalSales, unadjustedTotalPurchases: preparation.totalPurchases },
    warnings: [...preparation.warnings, 'Reviewed preparation adjustments change this return only, not posted ledger balances. Do not duplicate credit notes already included in the books. Confirm adjustment treatment before filing.'],
  });
}
