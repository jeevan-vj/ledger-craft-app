import { jsPDF } from 'jspdf';
import type { CustomerStatement } from '@ledgercraft/contracts';
export function statementPdf(value: CustomerStatement) {
  const pdf = new jsPDF(); let y = 20;
  function line(text: string, bold = false) {
    for (const part of pdf.splitTextToSize(text, 174) as string[]) {
      if (y > 275) { pdf.addPage(); y = 20; }
      pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 12 : 10); pdf.text(part, 18, y); y += 6;
    }
  }
  line(value.businessName, true); line(`Customer statement: ${value.customer.name}`, true); line(`${value.from} to ${value.to} | ${value.type} | ${value.currency}`); line(`Opening balance: ${value.openingBalance}`);
  for (const row of value.lines) { line(`${row.date}  ${row.reference}  ${row.description}`); line(`Debit ${row.debit}  Credit ${row.credit}  Balance ${row.runningBalance}`); }
  line(`Closing balance: ${value.closingBalance}`, true);
  line(`Aging: Current ${value.aging.current} | 1-30 ${value.aging.days1To30} | 31-60 ${value.aging.days31To60} | 61-90 ${value.aging.days61To90} | 90+ ${value.aging.over90}`);
  line(`Unallocated control: ${value.aging.unallocatedControl}`);
  for (const warning of value.warnings) line(warning);
  line(`Generated: ${value.generatedAt}`); pdf.save(`Statement-${value.customer.id}-${value.to}.pdf`);
}
