import { z } from 'zod';
import {
  applyLedgerAuditResponseSchema, companyIncomeTaxPreparationRequestSchema,
  companyIncomeTaxPreparationResponseSchema, createTaxReturnRequestSchema,
  gstAdjustmentPreparationRequestSchema, gstPreparationQuerySchema, gstPreparationResponseSchema,
  ledgerAuditResponseSchema, openingBalancesRequestSchema, openingBalancesResponseSchema,
  taxReturnSchema, type CompanyIncomeTaxPreparationRequest, type CreateTaxReturnRequest,
  type GstAdjustmentPreparationRequest, type GstPreparationQuery, type ApplyLedgerAuditRequest,
  type OpeningBalancesRequest,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...(body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body),
  }) });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return schema.parse(await response.json());
}
export const accountingCompletionApi = {
  gst(query: GstPreparationQuery) {
    const parsed = gstPreparationQuerySchema.parse(query);
    return request(`/api/tax/gst-preparation?${new URLSearchParams({ from: parsed.from, to: parsed.to, basis: parsed.basis ?? 'invoice' })}`, gstPreparationResponseSchema);
  },
  reviewedGst(input: GstAdjustmentPreparationRequest) {
    return request('/api/tax/gst-preparation', gstPreparationResponseSchema, gstAdjustmentPreparationRequestSchema.parse(input));
  },
  companyTax(input: CompanyIncomeTaxPreparationRequest) {
    return request('/api/tax/company-income-tax-preparation', companyIncomeTaxPreparationResponseSchema, companyIncomeTaxPreparationRequestSchema.parse(input));
  },
  async saveTaxDraft(input: CreateTaxReturnRequest, key: string) {
    const created = await request('/api/tax-returns', taxReturnSchema, createTaxReturnRequestSchema.parse(input), key);
    return request(`/api/tax-returns/${created.id}`, taxReturnSchema);
  },
  audit: () => request('/api/journal-entries/ledger-audit', ledgerAuditResponseSchema),
  applyAudit: (input: ApplyLedgerAuditRequest) => request('/api/journal-entries/ledger-audit/apply', applyLedgerAuditResponseSchema, input),
  opening: (input: OpeningBalancesRequest) => request('/api/journal-entries/opening-balances', openingBalancesResponseSchema, openingBalancesRequestSchema.parse(input)),
};
