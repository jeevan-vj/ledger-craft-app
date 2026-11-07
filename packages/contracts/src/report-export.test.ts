import { expect,it } from 'vitest';
import { financialReportRows,reportCsvCell } from './report-export';
import type { FinancialReportResponse } from './report';
it('exports exact server columns and totals without converting decimal text',()=>{
 const data={profitLoss:{rows:[{accountId:'one',accountName:'Consulting',accountNumber:'4000',balance:'9007199254740993.01'}],revenue:'9007199254740993.01',expenses:'0.00',netIncome:'9007199254740993.01'},columns:{periods:[{label:'Apr 2026',from:'2026-04-01',to:'2026-04-30',profitLoss:{rows:[],revenue:'0.00',expenses:'0.00',netIncome:'0.00'}}]}} as unknown as FinancialReportResponse;
 expect(financialReportRows(data,'profit-loss')).toContainEqual(['Net income','0.00','9007199254740993.01']);
 expect(reportCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');expect(reportCsvCell('-15.00')).toBe('"-15.00"');
});
