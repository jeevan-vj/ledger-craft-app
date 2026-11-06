import type { GstPreparationResponse, TaxReturnDto, TaxReturnListResponse } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';

export const gstPreparationApi = {
  prepare(from: string, to: string): Promise<GstPreparationResponse> {
    return apiRequest(`/api/tax/gst-preparation?${new URLSearchParams({ from, to })}`, { method: 'GET' });
  },
  async listDrafts(): Promise<TaxReturnDto[]> {
    return (await apiRequest<TaxReturnListResponse>('/api/tax-returns', { method: 'GET' })).taxReturns.filter((value) => value.returnType === 'GST' && value.status === 'draft');
  },
  save(figures: GstPreparationResponse, existingId?: string): Promise<TaxReturnDto> {
    return apiRequest(existingId ? `/api/tax-returns/${existingId}` : '/api/tax-returns', { method: existingId ? 'PATCH' : 'POST', body: JSON.stringify({
      periodStart: figures.from, periodEnd: figures.to, returnType: 'GST', status: 'draft',
      totalSales: figures.totalSales, totalPurchases: figures.totalPurchases,
      gstOnSales: figures.gstOnSales, gstOnPurchases: figures.gstOnPurchases, netGst: figures.netGstPosition,
    }) });
  },
  get(id: string): Promise<TaxReturnDto> { return apiRequest(`/api/tax-returns/${id}`, { method: 'GET' }); },
};
