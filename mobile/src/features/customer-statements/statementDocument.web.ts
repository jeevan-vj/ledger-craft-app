import type { CustomerStatement } from '@ledgercraft/contracts';
import { jsPDF } from 'jspdf';
import { statementDocumentRows } from './statementHtml';
export async function shareStatementPdf(value:CustomerStatement){const pdf=new jsPDF();pdf.setFontSize(17);pdf.text('Customer statement',14,20);pdf.setFontSize(10);let y=32;for(const[k,v]of statementDocumentRows(value)){const lines=pdf.splitTextToSize(`${k}: ${v}`,180)as string[];for(const line of lines){if(y>277){pdf.addPage();y=20;}pdf.text(line,14,y);y+=5;}y+=3;}pdf.save(`Statement-${value.from}-${value.to}.pdf`);}
