import { jsPDF } from 'jspdf';
import type { CompanyIncomeTaxPreparationResponse } from '@ledgercraft/contracts';

/** A copy of the reviewed exact-string worksheet, never an IR4 or a filing. */
export async function downloadCompanyTaxPdf(value: CompanyIncomeTaxPreparationResponse) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 22;
  const next = () => { if (y > 265) { pdf.addPage(); y = 22; } };
  const text = (message: string) => {
    const lines = pdf.splitTextToSize(message, 174) as string[];
    for (const line of lines) { next(); pdf.text(line, 18, y); y += 6; }
  };
  const row = (label: string, amount: string) => { next(); pdf.text(label, 18, y); pdf.text(`NZD ${amount}`, 192, y, { align: 'right' }); y += 8; };
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18);
  text('Company income tax worksheet');
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  text(`${value.from} to ${value.to} · Ordinary NZ company · 28% rate confirmed`);
  text('Draft preparation only: not an IR4 return, provisional-tax calculation or IRD submission.'); y += 4;
  row('Posted accounting profit', value.accountingProfit); row('Tax add-backs', value.addBacks);
  row('Tax deductions', value.deductions); row('Tax-adjusted profit', value.taxAdjustedProfit);
  row('Available losses brought forward', value.lossesBroughtForward); row('Losses applied', value.lossesApplied);
  row('Taxable income', value.taxableIncome); row('Income tax at 28%', value.incomeTax);
  row('Available tax credits', value.taxCredits); row('Income tax payable', value.incomeTaxPayable);
  row('Losses carried forward', value.lossesCarriedForward); row('Excess credits for review', value.excessCredits);
  y += 4;
  text(`Prepared ${value.preparedAt}`);
  for (const adjustment of value.adjustments) text(`${adjustment.kind === 'add_back' ? 'Add-back' : 'Deduction'} NZD ${adjustment.amount} · ${adjustment.sourceReference}: ${adjustment.reason}`);
  for (const warning of value.warnings) text(warning);
  text('Your accountant must confirm entity eligibility, tax adjustments, loss continuity and credit availability before filing separately in myIR.');
  pdf.setProperties({ title: `Company tax worksheet ${value.from} to ${value.to}`, creator: 'LedgerCraft' });
  await pdf.save(`Company-Tax-Worksheet-${value.from}-to-${value.to}.pdf`, { returnPromise: true });
}
