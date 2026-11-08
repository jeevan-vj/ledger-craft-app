import type { FinancialReportResponse } from './report';
export type ReportSection = 'profit-loss' | 'balance-sheet' | 'trial-balance' | 'cash-flow' | 'receivables' | 'payables';
export const reportSectionLabels: Record<ReportSection,string> = {'profit-loss':'Profit & loss','balance-sheet':'Balance sheet','trial-balance':'Trial balance','cash-flow':'Cash flow',receivables:'Receivables aging',payables:'Payables aging'};
/** Export strings copied from canonical server figures; never calculate totals. */
export function financialReportRows(report: FinancialReportResponse, section: ReportSection): string[][] {
 const periods=report.columns?.periods;
 if(section==='profit-loss'||section==='cash-flow') {
  const key=section==='profit-loss'?'profitLoss':'cashFlow';const total=report[key];const metrics=section==='profit-loss'?['revenue','expenses','netIncome']:['openingCash','inflows','outflows','netCashFlow','closingCash'];
  const labels:Record<string,string>={revenue:'Revenue',expenses:'Expenses',netIncome:'Net income',openingCash:'Opening cash',inflows:'Inflows',outflows:'Outflows',netCashFlow:'Net cash flow',closingCash:'Closing cash'};
  const value=(obj:unknown,key:string)=>String((obj as Record<string,unknown>)[key]);
  const headers=['Account',...(periods?.map(p=>`${p.label} (${p.from} to ${p.to})`)??[]),'Total'];
  return [headers,...total.rows.map(row=>[`${row.accountNumber??''} ${row.accountName}`.trim(),...(periods?.map(p=>p[key].rows.find(r=>r.accountId===row.accountId)?.balance??'0.00')??[]),row.balance]),...metrics.map(metric=>[labels[metric],...(periods?.map(p=>value(p[key],metric))??[]),value(total,metric)])];
 }
 if(section==='receivables'||section==='payables'){const aging=report[section==='receivables'?'receivablesAging':'payablesAging'];return [['Document','Party','Due date','Age','Outstanding'],...aging.items.map(r=>[r.number,r.partyName,r.dueDate,r.bucket,r.balanceDue]),['Total','','','',aging.total],['Unallocated control','','','',aging.unallocatedControl??'0.00']];}
 if(section==='trial-balance') return [
  ['Account','Class','Opening debit','Opening credit','Period debit','Period credit','Closing debit','Closing credit'],
  ...report.trialBalance.rows.map(row=>[`${row.accountNumber??''} ${row.accountName}`.trim(),row.accountClass,row.openingDebit,row.openingCredit,row.debit,row.credit,row.closingDebit,row.closingCredit]),
  ['Period totals','','','',report.trialBalance.totalDebits,report.trialBalance.totalCredits,'',''],
  ...(report.trialBalance.closingDebits!==undefined&&report.trialBalance.closingCredits!==undefined?[['Closing totals','','','','','',report.trialBalance.closingDebits,report.trialBalance.closingCredits]]:[]),
 ];
 const statement=report.balanceSheet;
 const rows=[['Account','Class','Debit','Credit','Balance'],...statement.rows.map(row=>[`${row.accountNumber??''} ${row.accountName}`.trim(),row.accountClass,row.debit,row.credit,row.balance])];
 return [...rows,['Assets','','','',report.balanceSheet.assets],['Liabilities','','','',report.balanceSheet.liabilities],...(statement.accumulatedEarnings !== undefined ? [['Accumulated earnings (included in equity)','','','',statement.accumulatedEarnings]] : []),['Equity (includes retained income)','','','',report.balanceSheet.equity]];
}
export function reportCsvCell(value:string){const safe=/^[\s]*[=+@\t\r]/.test(value)||/^\s*-(?!\d+(?:\.\d+)?\s*$)/.test(value)?`'${value}`:value;return `"${safe.replace(/"/g,'""')}"`;}
export function financialReportCsv(report: FinancialReportResponse,section: ReportSection){return [[reportSectionLabels[section]],['Period',report.meta.from,report.meta.to],['Basis',report.meta.basis],...(report.meta.cashRecognition?[['Cash recognition','Settled posted-source components; original journals unchanged']]:[]),...(report.meta.warnings?.map(warning=>['Review warning',warning])??[]),[],...financialReportRows(report,section)].map(row=>row.map(reportCsvCell).join(',')).join('\n');}
