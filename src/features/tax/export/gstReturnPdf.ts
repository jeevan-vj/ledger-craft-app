import { jsPDF } from 'jspdf';
import type { TaxReturn } from '@/types/payment';

function money(value: number): string {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: 2,
  }).format(value);
}

function date(value: string): string {
  return new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export async function downloadGstReturnPdf(taxReturn: TaxReturn): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const left = 18;
  let y = 22;
  const row = (label: string, value: string) => {
    pdf.setFont('helvetica', 'normal');
    pdf.text(label, left, y);
    pdf.setFont('helvetica', 'bold');
    pdf.text(value, 192, y, { align: 'right' });
    y += 9;
  };

  pdf.setTextColor(30, 41, 59);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('LedgerCraft GST return', left, y);
  y += 10;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text('Preparation and filing record — New Zealand GST', left, y);
  y += 10;
  pdf.line(left, y, 192, y);
  y += 10;

  pdf.setFontSize(11);
  row('Return period', `${date(taxReturn.periodStart)} – ${date(taxReturn.periodEnd)}`);
  row('Status', taxReturn.status === 'submitted' ? 'Recorded as filed' : 'Draft');
  if (taxReturn.submittedAt) row('Filed date', date(taxReturn.submittedAt));
  if (taxReturn.irdReference) row('IRD confirmation reference', taxReturn.irdReference);

  y += 4;
  pdf.line(left, y, 192, y);
  y += 10;
  row('Total sales (including GST)', money(taxReturn.totalSales));
  row('GST on sales', money(taxReturn.gstOnSales));
  row('Total purchases (including GST)', money(taxReturn.totalPurchases));
  row('GST on purchases', money(taxReturn.gstOnPurchases));
  row(
    'Net GST position',
    `${money(Math.abs(taxReturn.netGst))} ${taxReturn.netGst < 0 ? 'refund' : 'to pay'}`,
  );

  const reconciliation = taxReturn.returnData?.reconciliation;
  if (reconciliation) {
    y += 4;
    pdf.line(left, y, 192, y);
    y += 10;
    row('Reconciliation', reconciliation.status.replace('_', ' '));
    row('Unreconciled transactions', String(reconciliation.unreconciledTransactionCount));
    row('Figures match books', reconciliation.figuresMatch ? 'Yes' : 'No');
  }

  y = 278;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(
    'This document is a LedgerCraft preparation record. IRD filing occurs separately in myIR.',
    left,
    y,
  );
  pdf.setProperties({
    title: `GST return ${taxReturn.periodStart} to ${taxReturn.periodEnd}`,
    subject: 'GST return preparation and filing record',
    creator: 'LedgerCraft',
  });
  await pdf.save(`GST-Return-${taxReturn.periodStart}-to-${taxReturn.periodEnd}.pdf`, {
    returnPromise: true,
  });
}
