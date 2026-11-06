import type { CreditNoteDto, CreditNoteListResponse, CreateCreditNoteRequest, RefundCreditNoteRequest, ReverseCreditNoteRequest } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';
export const creditNotesApi = {
  async list(invoiceId: string): Promise<CreditNoteDto[]> { return (await apiRequest<CreditNoteListResponse>(`/api/credit-notes?${new URLSearchParams({ invoiceId })}`)).creditNotes; },
  banks: purchasesApi.listBankAccounts,
  create(input: CreateCreditNoteRequest, key: string): Promise<CreditNoteDto> { return apiRequest('/api/credit-notes', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }); },
  reverse(id: string, input: ReverseCreditNoteRequest): Promise<CreditNoteDto> { return apiRequest(`/api/credit-notes/${id}/reverse`, { method: 'POST', body: JSON.stringify(input) }); },
  refund(id: string, input: RefundCreditNoteRequest, key: string): Promise<CreditNoteDto> { return apiRequest(`/api/credit-notes/${id}/refunds`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }); },
  reverseRefund(id: string, refundId: string, input: ReverseCreditNoteRequest): Promise<CreditNoteDto> { return apiRequest(`/api/credit-notes/${id}/refunds/${refundId}/reverse`, { method: 'POST', body: JSON.stringify(input) }); },
};
