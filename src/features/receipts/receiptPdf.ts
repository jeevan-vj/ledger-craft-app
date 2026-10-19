import { jsPDF } from 'jspdf';
import type { Receipt } from '@/types/payment';

function currencyLabel(currency: string | undefined): string {
  return currency ? `${currency} ` : '';
}

export function downloadReceiptPdf(receipt: Receipt): void {
  const data = receipt.receiptData;
  if (!data) throw new Error('Receipt details are unavailable');

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const currency = currencyLabel(data.invoice.currency);
  const rows: Array<[string, string]> = [
    ['Receipt number', receipt.receiptNumber],
    ['Invoice', data.invoice.invoiceNumber],
    ['Customer', data.customer.name],
    ['Payment date', data.paymentDate],
    ['Payment method', data.paymentMethod],
    ['Amount paid', `${currency}${data.amountPaid.toFixed(2)}`],
    ['Remaining balance', `${currency}${data.balanceAfterPayment.toFixed(2)}`],
  ];

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.text('Payment receipt', 48, 64);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Thank you for your payment.', 48, 88);

  let y = 128;
  for (const [label, value] of rows) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(label, 48, y);
    pdf.setFont('helvetica', 'normal');
    pdf.text(value || '—', 210, y);
    y += 28;
  }

  pdf.setDrawColor(220);
  pdf.line(48, y + 4, 547, y + 4);
  pdf.setFontSize(10);
  pdf.text(`Generated ${new Date(receipt.generatedAt).toLocaleString()}`, 48, y + 28);
  pdf.save(`Receipt-${receipt.receiptNumber}.pdf`);
}
