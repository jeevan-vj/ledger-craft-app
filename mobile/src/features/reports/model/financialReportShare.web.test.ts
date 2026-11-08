import {shareFinancialReport} from './financialReportShare.web';
import {jsPDF} from 'jspdf';
import type {FinancialReportResponse} from '@ledgercraft/contracts';
jest.mock('jspdf',()=>({jsPDF:jest.fn()}));
it('exports the eight-column trial balance in landscape with exact closing and period totals',async()=>{
 const pdf={setFontSize:jest.fn(),text:jest.fn(),splitTextToSize:(s:string)=>[s],addPage:jest.fn(),save:jest.fn()};jest.mocked(jsPDF).mockImplementation(()=>pdf as never);
 const report={meta:{from:'2026-10-01',to:'2026-10-31',basis:'accrual',generatedAt:'2026-11-07'},trialBalance:{rows:[],totalDebits:'14605.00',totalCredits:'14605.00',closingDebits:'13680.00',closingCredits:'13680.00'}} as unknown as FinancialReportResponse;
 await shareFinancialReport(report,'trial-balance','Kauri','pdf');expect(jsPDF).toHaveBeenCalledWith({orientation:'landscape'});expect(pdf.text).toHaveBeenCalledWith(['13680.00'],expect.any(Number),expect.any(Number));expect(pdf.text).toHaveBeenCalledWith(['14605.00'],expect.any(Number),expect.any(Number));expect(pdf.save).toHaveBeenCalledWith('Report-trial-balance-2026-10-01-2026-10-31.pdf');
});
