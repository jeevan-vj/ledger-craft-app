import { jsPDF } from 'jspdf';
import type { TaxReturnDto } from '@ledgercraft/contracts';
import type { TaxReturn } from '@/types/payment';

function money(value: number | string): string {
  const [integer, fraction = ''] = String(value).split('.');
  return `$${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}
function date(value: string): string {
  return new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
export async function downloadGstReturnPdf(taxReturn: TaxReturn | TaxReturnDto): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const left = 18; let y = 22;
  const next = () => { if (y > 258) { pdf.addPage(); y = 22; } };
  const row = (label: string, value: string) => {
    next(); pdf.setFontSize(11); pdf.setFont('helvetica', 'normal'); pdf.text(label, left, y);
    pdf.setFont('helvetica', 'bold'); pdf.text(value, 192, y, { align: 'right' }); y += 9;
  };
  pdf.setTextColor(30, 41, 59); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20);
  pdf.text('GST return filing copy', left, y); y += 10;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  pdf.text('GST preparation and externally recorded filing history', left, y); y += 8; pdf.line(left, y, 192, y); y += 10;
  pdf.setFontSize(11); row('Return period', `${date(taxReturn.periodStart)} – ${date(taxReturn.periodEnd)}`);
  row('Status', taxReturn.status === 'submitted' ? 'Recorded as filed' : 'Draft');
  const preparation = taxReturn.returnData?.preparation;
  if (preparation) {
    const basis = preparation.basis === 'payments' ? 'Payments' : preparation.basis === 'hybrid' ? 'Hybrid' : 'Invoice';
    row('Preparation basis', `${basis} basis · NZD`);
    if (preparation.dueDate) row('Confirmed due date', date(preparation.dueDate));
  }
  if (taxReturn.submittedAt) row('Filed date', date(taxReturn.submittedAt));
  if (taxReturn.irdReference) row('IRD confirmation reference', taxReturn.irdReference);
  row('Total sales (including GST)', money(taxReturn.totalSales)); row('GST on sales', money(taxReturn.gstOnSales));
  row('Total purchases (including GST)', money(taxReturn.totalPurchases)); row('GST on purchases', money(taxReturn.gstOnPurchases));
  const net = String(taxReturn.netGst); row('Net GST position', `${money(net.replace(/^-/, ''))} ${net.startsWith('-') ? 'refund' : 'to pay'}`);
  const calculation = taxReturn.returnData?.gstCalculation;
  if (calculation) {
    row('Calculation version', calculation.version);
    for (const [key, value] of Object.entries(calculation.myIrBoxes)) row(`myIR ${key}`, money(String(value)));
    for (const [kind, count] of Object.entries(calculation.sourceCounts)) row(`Included ${kind}`, String(count));
    const notes = [...(calculation.mappingStatus === 'requires_confirmation' ? ['Mapping requires confirmation: missing myIR boxes are not zero.'] : []), ...calculation.warnings];
    for (const note of notes) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
      for (const line of pdf.splitTextToSize(note, 174) as string[]) { next(); pdf.text(line, left, y); y += 5; }
      y += 3;
    }
  }
  const reconciliation = taxReturn.returnData?.reconciliation;
  if (reconciliation) { row('Reconciliation', reconciliation.status.replace('_', ' ')); row('Unreconciled transactions', String(reconciliation.unreconciledTransactionCount)); row('Figures match books', reconciliation.figuresMatch ? 'Yes' : 'No'); }
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
  pdf.text('Preparation record only. File separately in myIR; this PDF does not submit a return to IRD.', left, Math.max(y + 8, 278));
  pdf.setProperties({ title: `GST return ${taxReturn.periodStart} to ${taxReturn.periodEnd}`, subject: 'GST return preparation and filing record', creator: 'LedgerCraft' });
  await pdf.save(`GST-Return-${taxReturn.periodStart}-to-${taxReturn.periodEnd}.pdf`, { returnPromise: true });
}
