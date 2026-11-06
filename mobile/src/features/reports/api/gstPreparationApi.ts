import { gstPreparationResponseSchema, taxReturnSchema, taxReturnListResponseSchema } from '@ledgercraft/contracts';
import type { GstPreparationResponse, GstAdjustmentPreparationRequest, CompanyIncomeTaxPreparationRequest, CompanyIncomeTaxPreparationResponse, TaxReturnDto, TaxReturnListResponse } from '@ledgercraft/contracts';
import { writeTaxDraft } from './taxDraftWrite';
import { apiRequest } from '@/features/auth/api/http';

export const gstPreparationApi = {
  prepare(from: string, to: string, basis: GstPreparationResponse['basis'] = 'invoice'): Promise<GstPreparationResponse> {
    return apiRequest(`/api/tax/gst-preparation?${new URLSearchParams({ from, to, basis })}`, { method: 'GET' }).then(value => gstPreparationResponseSchema.parse(value));
  },
  review(input: GstAdjustmentPreparationRequest): Promise<GstPreparationResponse> {
    return apiRequest('/api/tax/gst-preparation', { method: 'POST', body: JSON.stringify(input) }).then(value => gstPreparationResponseSchema.parse(value));
  },
  company(input: CompanyIncomeTaxPreparationRequest): Promise<CompanyIncomeTaxPreparationResponse> {
    return apiRequest('/api/tax/company-income-tax-preparation', { method: 'POST', body: JSON.stringify(input) });
  },
  async companyDrafts(): Promise<TaxReturnDto[]> {
    return taxReturnListResponseSchema.parse(await apiRequest<TaxReturnListResponse>('/api/tax-returns', { method: 'GET' })).taxReturns.filter((value) => value.returnType === 'Income_Tax' && value.status === 'draft' && value.returnData?.companyIncomeTax);
  },
  saveCompany(figures: CompanyIncomeTaxPreparationResponse, existingId?: string): Promise<TaxReturnDto> {
    return writeTaxDraft({
      periodStart: figures.from, periodEnd: figures.to, returnType: 'Income_Tax', status: 'draft',
      totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00',
      returnData: { companyIncomeTax: figures },
    }, existingId);
  },
  async listDrafts(): Promise<TaxReturnDto[]> {
    return taxReturnListResponseSchema.parse(await apiRequest<TaxReturnListResponse>('/api/tax-returns', { method: 'GET' })).taxReturns.filter((value) => value.returnType === 'GST' && value.status === 'draft');
  },
  save(figures: GstPreparationResponse, existingId?: string): Promise<TaxReturnDto> {
    return writeTaxDraft({
      periodStart: figures.from, periodEnd: figures.to, returnType: 'GST', status: 'draft',
      totalSales: figures.totalSales, totalPurchases: figures.totalPurchases,
      gstOnSales: figures.gstOnSales, gstOnPurchases: figures.gstOnPurchases, netGst: figures.netGstPosition,
      returnData: { preparation: { basis: figures.basis, baseCurrency: figures.baseCurrency, ...(figures.calculation ? { calculationFingerprint: figures.calculation.fingerprint } : {}) }, ...(figures.review ? { gstReview: figures.review } : {}) },
    }, existingId);
  },
  get(id: string): Promise<TaxReturnDto> { return apiRequest(`/api/tax-returns/${id}`, { method: 'GET' }).then(value => taxReturnSchema.parse(value)); },
};
