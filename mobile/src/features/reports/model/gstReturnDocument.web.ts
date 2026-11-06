import type { TaxReturnDto } from '@ledgercraft/contracts';
import { jsPDF } from 'jspdf';
import { gstReturnRows, gstReturnTitle } from './gstReturnHtml';
export { buildGstReturnHtml } from './gstReturnHtml';
export async function shareGstReturn(saved: TaxReturnDto): Promise<void> {
 const pdf = new jsPDF(); pdf.setFontSize(16); pdf.text(gstReturnTitle(saved).replace('—', '-'), 14, 20);
 let y = 32; pdf.setFontSize(10);
 for (const [label, value] of gstReturnRows(saved)) {
  const lines = pdf.splitTextToSize(`${label}: ${value}`, 180) as string[];
  if (y + lines.length * 5 > 275) { pdf.addPage(); y = 20; }
  pdf.text(lines, 14, y); y += lines.length * 5 + 4;
 }
 const note = pdf.splitTextToSize('EasyBizInvoice does not submit this return to IRD. File separately in myIR and retain supporting books. This is preparation, not filing acceptance.', 180) as string[];
 if (y + note.length * 5 > 280) { pdf.addPage(); y = 20; } pdf.text(note, 14, y + 6);
 pdf.save(`GST-${saved.periodStart}-${saved.periodEnd}-${saved.status}.pdf`);
}
