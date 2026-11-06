import { gstPreparationResponseSchema, type GstPreparationQuery, type GstPreparationResponse } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { financialReportInTx } from '../reports/reports.service';
import { grossGstDocuments } from './gst-preparation.repository';

export async function gstPreparationForUser(db: Database, userId: string, period: GstPreparationQuery): Promise<GstPreparationResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const report = await financialReportInTx(tx, ctx.organisationId, { ...period, basis: 'accrual', baseCurrency: 'NZD' });
    const documents = await grossGstDocuments(tx, ctx.organisationId, period);
    const total = (rows: Array<{ amount: string }>) => roundMoney(rows.reduce((sum, row) => sum.add(row.amount), decimal(0)));
    return gstPreparationResponseSchema.parse({
      ...period, basis: 'invoice', baseCurrency: 'NZD',
      totalSales: total(documents.sales), totalPurchases: total(documents.purchases),
      gstOnSales: report.taxSummary.outputGst, gstOnPurchases: report.taxSummary.inputGst,
      netGstPosition: report.taxSummary.netGst,
      warnings: [...report.taxSummary.warnings, ...(documents.hasReversals
        ? ['This period includes cancellation or expense reversal movements. Review the signed totals and GST adjustments before filing.'] : [])],
    });
  });
}
