import { financialReportResponseSchema, financialReportQuerySchema, generalLedgerResponseSchema, reportOptionsSchema, type FinancialReportQuery, type FinancialReportResponse, type ReportBasis as SharedReportBasis } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
export type ReportBasis=SharedReportBasis;
export type ReportQuery=FinancialReportQuery;
export type FinancialReport=FinancialReportResponse;
export type ReportAccountRow=FinancialReport['profitLoss']['rows'][number];
export type AgingItem=FinancialReport['receivablesAging']['items'][number];
export type AgingReport=FinancialReport['receivablesAging'];
export type GstPosition=FinancialReport['taxSummary']['position'];
function parameters(input:ReportQuery){const query=financialReportQuerySchema.parse(input);const params=new URLSearchParams({from:query.from,to:query.to,basis:query.basis,baseCurrency:query.baseCurrency});for(const key of ['columns','comparisonFrom','comparisonTo'] as const)if(query[key])params.set(key,query[key]!);for(const key of ['accountIds','customerIds','vendorIds'] as const)for(const id of query[key]??[])params.append(key,id);return params;}
export const reportsApi={
 async financial(query:ReportQuery):Promise<FinancialReport>{return financialReportResponseSchema.parse(await apiRequest(`/api/reports/financial?${parameters(query)}`,{method:'GET'}));},
 async generalLedger(query:ReportQuery){return generalLedgerResponseSchema.parse(await apiRequest(`/api/reports/general-ledger?${parameters(query)}`,{method:'GET'}));},
 async options(){return reportOptionsSchema.parse(await apiRequest('/api/reports/options',{method:'GET'}));},
};
