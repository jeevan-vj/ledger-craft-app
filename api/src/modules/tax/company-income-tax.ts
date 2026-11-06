import { companyIncomeTaxPreparationResponseSchema, type CompanyIncomeTaxPreparationRequest } from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import { getBusinessProfile } from '../business-profile/business-profile.repository';
import { getLocalization } from '../currency/currency.repository';
import { decimal, roundMoney } from '../invoices/money';
import { financialReportInTx } from '../reports/reports.service';

export async function companyIncomeTaxPreparationForUser(db: Database, userId: string, input: CompanyIncomeTaxPreparationRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const profile = await getBusinessProfile(tx, ctx.organisationId);
    const localization = await getLocalization(tx, ctx.organisationId);
    if (!profile || !['NZ', 'NEW ZEALAND'].includes(profile.country.toUpperCase()) || localization.baseCurrency !== 'NZD') {
      throw new HTTPException(400, { message: 'Company tax preparation requires a New Zealand company with NZD base books' });
    }
    const report = await financialReportInTx(tx, ctx.organisationId, { from: input.from, to: input.to, basis: 'accrual', baseCurrency: 'NZD' });
    const total = (kind: 'add_back' | 'deduction') => input.adjustments.filter(row => row.kind === kind).reduce((sum, row) => sum.add(row.amount), decimal(0));
    const addBacks = total('add_back'); const deductions = total('deduction');
    const profit = decimal(report.profitLoss.netIncome); const adjusted = profit.add(addBacks).sub(deductions);
    const positive = (value: ReturnType<typeof decimal>) => value.compare(0) > 0 ? value : decimal(0);
    const eligible = positive(adjusted); const brought = decimal(input.lossesBroughtForward);
    const applied = eligible.compare(brought) < 0 ? eligible : brought;
    const taxable = eligible.sub(applied); const incomeTax = decimal(roundMoney(taxable.mul(input.taxRate).div('100')));
    const credits = decimal(input.taxCredits);
    return companyIncomeTaxPreparationResponseSchema.parse({
      from: input.from, to: input.to, entityType: 'nz_company', baseCurrency: 'NZD', taxRate: input.taxRate,
      accountingProfit: roundMoney(profit), addBacks: roundMoney(addBacks), deductions: roundMoney(deductions), taxAdjustedProfit: roundMoney(adjusted),
      lossesBroughtForward: input.lossesBroughtForward, lossesApplied: roundMoney(applied), lossesCarriedForward: roundMoney(brought.sub(applied).add(positive(decimal(0).sub(adjusted)))),
      taxableIncome: roundMoney(taxable), incomeTax: roundMoney(incomeTax), taxCredits: input.taxCredits,
      incomeTaxPayable: roundMoney(positive(incomeTax.sub(credits))), excessCredits: roundMoney(positive(credits.sub(incomeTax))),
      adjustments: input.adjustments, preparedAt: new Date().toISOString(), preparedBy: ctx.userId,
      warnings: [
        'Standard NZ company income-tax preparation estimate using the explicitly confirmed 28% rate; this is not an IR4 filing or a full tax assessment.',
        'Confirm entity eligibility, loss continuity/availability, tax adjustments and credit eligibility with your accountant. Excess credits are not automatically refundable.',
        'Provisional-tax instalments, imputation, shareholder adjustments, special entity rates and IRD submission are outside this worksheet. Confirm current law and dates in myIR before filing.',
      ],
    });
  });
}
