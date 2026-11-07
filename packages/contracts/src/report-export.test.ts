import { expect,it } from 'vitest';
import { financialReportRows,reportCsvCell } from './report-export';
import type { FinancialReportResponse } from './report';
it('exports exact server columns and totals without converting decimal text',()=>{
 const data={profitLoss:{rows:[{accountId:'one',accountName:'Consulting',accountNumber:'4000',balance:'9007199254740993.01'}],revenue:'9007199254740993.01',expenses:'0.00',netIncome:'9007199254740993.01'},columns:{periods:[{label:'Apr 2026',from:'2026-04-01',to:'2026-04-30',profitLoss:{rows:[],revenue:'0.00',expenses:'0.00',netIncome:'0.00'}}]}} as unknown as FinancialReportResponse;
 expect(financialReportRows(data,'profit-loss')).toContainEqual(['Net income','0.00','9007199254740993.01']);
 expect(reportCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');expect(reportCsvCell('-15.00')).toBe('"-15.00"');
});
it('exports closing trial-balance sides separately from period turnover',()=>{
 const data={trialBalance:{rows:[{accountName:'Capital',accountNumber:'3000',accountClass:'equity',debit:'0.00',credit:'0.00',balance:'10000.00',openingDebit:'0.00',openingCredit:'10000.00',closingDebit:'0.00',closingCredit:'10000.00'}],totalDebits:'8165.00',totalCredits:'8165.00',closingDebits:'13680.00',closingCredits:'13680.00'}} as unknown as FinancialReportResponse;
 expect(financialReportRows(data,'trial-balance')).toContainEqual(['Closing totals','','','','','','13680.00','13680.00']);
 expect(financialReportRows(data,'trial-balance')[0]).toEqual(['Account','Class','Opening debit','Opening credit','Period debit','Period credit','Closing debit','Closing credit']);
});
