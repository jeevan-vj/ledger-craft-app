import type { FinancialReportQuery, FinancialReportResponse, GeneralLedgerResponse } from '@ledgercraft/contracts';
import { financialReportResponseSchema, generalLedgerResponseSchema } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export class ReportsApiError extends Error {
  constructor(message: string, readonly status: number, readonly requestId?: string) { super(message); this.name = 'ReportsApiError'; }
}

function params(query: FinancialReportQuery) {
  const result = new URLSearchParams({ from: query.from, to: query.to, basis: query.basis, baseCurrency: query.baseCurrency });
  if (query.comparisonFrom) result.set('comparisonFrom', query.comparisonFrom);
  if (query.comparisonTo) result.set('comparisonTo', query.comparisonTo);
  for (const key of ['accountIds', 'categoryIds', 'customerIds', 'vendorIds'] as const) for (const value of query[key] ?? []) result.append(key, value);
  return result.toString();
}

async function request<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) { const failure = await readApiFailure(response); throw new ReportsApiError(failure.message, failure.status, failure.requestId); }
  return parse(await response.json());
}

export const reportsApi = {
  financial(query: FinancialReportQuery): Promise<FinancialReportResponse> { return request(`/api/reports/financial?${params(query)}`, (value) => financialReportResponseSchema.parse(value)); },
  generalLedger(query: FinancialReportQuery): Promise<GeneralLedgerResponse> { return request(`/api/reports/general-ledger?${params(query)}`, (value) => generalLedgerResponseSchema.parse(value)); },
};
