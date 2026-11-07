import {financialReportCsv,financialReportRows,reportSectionLabels,type FinancialReportResponse,type ReportSection} from '@ledgercraft/contracts';
import {jsPDF} from 'jspdf';
export async function shareFinancialReport(report:FinancialReportResponse,section:ReportSection,business:string,format:'pdf'|'csv'){
 const filename=`Report-${section}-${report.meta.from}-${report.meta.to}.${format}`;
 if(format==='csv'){const url=URL.createObjectURL(new Blob([financialReportCsv(report,section)],{type:'text/csv'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);return;}
 const wide=Boolean(report.columns);const pdf=new jsPDF({orientation:wide?'landscape':'portrait'});let y=16;const width=wide?273:186;const limit=wide?194:280;
 const title=()=>{pdf.setFontSize(13);pdf.text(`${business} - ${reportSectionLabels[section]}`,12,y);y+=7;pdf.setFontSize(8);pdf.text(`${report.meta.from} to ${report.meta.to} / ${report.meta.basis} / NZD`,12,y);y+=5;pdf.text(`Generated ${report.meta.generatedAt}`,12,y);y+=6;if(report.meta.cashRecognition){pdf.text('Cash recognition from settled sources; original journals unchanged.',12,y);y+=6;}for(const warning of report.meta.warnings??[]){const lines=pdf.splitTextToSize(warning,width);pdf.text(lines,12,y);y+=lines.length*4+3;}y+=2;};title();
 const data=financialReportRows(report,section);
 for(let start=1;start<data[0].length;start+=12){if(start>1){pdf.addPage();y=16;title();}const indices=Array.from({length:Math.min(12,data[0].length-start)},(_,i)=>start+i);const first=wide?54:60;const cellWidth=(width-first)/indices.length;
 for(const row of data){const values=[row[0],...indices.map(i=>row[i]??'')];const wrapped=values.map((value,i)=>pdf.splitTextToSize(value,i===0?first-3:cellWidth-3) as string[]);const h=Math.max(...wrapped.map(v=>v.length))*4+3;if(y+h>limit){pdf.addPage();y=16;title();}pdf.text(wrapped[0],12,y);wrapped.slice(1).forEach((text,i)=>pdf.text(text,12+first+i*cellWidth,y));y+=h;}}
 pdf.save(filename);
}
