import { jsPDF } from 'jspdf';
import { financialReportRows, reportSectionLabels, type FinancialReportResponse, type ReportSection } from '@ledgercraft/contracts';
export function buildFinancialReportPdf(report:FinancialReportResponse,section:ReportSection,businessName:string) {
 const data=financialReportRows(report,section);const wide=Boolean(report.columns&&['profit-loss','cash-flow'].includes(section));const pdf=new jsPDF({orientation:wide?'landscape':'portrait'});const width=wide?297:210;const height=wide?210:297;const firstWidth=wide?55:60;
 const chunks:Array<number[]> = [];
 for(let start=1;start<data[0].length;start+=12)chunks.push(Array.from({length:Math.min(12,data[0].length-start)},(_,i)=>start+i));
 let pageIndex=0;
 for(const cols of chunks){
  if(pageIndex++)pdf.addPage();let y=14;
  const header=()=>{pdf.setFontSize(14);pdf.text(`${businessName} · ${reportSectionLabels[section]}`,12,y);y+=7;pdf.setFontSize(9);pdf.text(`${report.meta.from} to ${report.meta.to} · ${report.meta.basis} · ${report.meta.baseCurrency}`,12,y);y+=5;pdf.text(`Generated ${report.meta.generatedAt}`,12,y);y+=7;if(report.meta.cashRecognition){pdf.text('Cash recognition from settled posted sources; original journals unchanged.',12,y);y+=6;}for(const warning of report.meta.warnings??[]){const lines=pdf.splitTextToSize(warning,width-24);pdf.text(lines,12,y);y+=lines.length*4+3;}y+=2;};header();
  const cellWidth=(width-24-firstWidth)/cols.length;
  for(const [index,row] of data.entries()){
   const cells=[row[0],...cols.map(c=>row[c]??'')];const wrapped=cells.map((cell,i)=>pdf.splitTextToSize(cell,i===0?firstWidth-3:cellWidth-3) as string[]);const rowHeight=Math.max(...wrapped.map(v=>v.length))*4+4;
   if(y+rowHeight>height-12){pdf.addPage();y=14;header();}
   pdf.setFont('helvetica',index===0?'bold':'normal');pdf.setFontSize(wide?8:9);pdf.text(wrapped[0],12,y);
   for(let i=1;i<wrapped.length;i++)pdf.text(wrapped[i],12+firstWidth+(i-1)*cellWidth,y);
   y+=rowHeight;pdf.setDrawColor(220);pdf.line(12,y-3,width-12,y-3);
  }
 }
 return pdf;
}
export function downloadFinancialReportPdf(report:FinancialReportResponse,section:ReportSection,businessName:string){buildFinancialReportPdf(report,section,businessName).save(`Report-${section}-${report.meta.from}-${report.meta.to}.pdf`);}
