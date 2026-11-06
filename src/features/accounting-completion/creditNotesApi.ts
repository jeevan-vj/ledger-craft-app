import { z } from 'zod';
import { creditNoteListResponseSchema, creditNoteSchema, createCreditNoteRequestSchema, refundCreditNoteRequestSchema, reverseCreditNoteRequestSchema, type CreateCreditNoteRequest, type RefundCreditNoteRequest, type ReverseCreditNoteRequest } from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';
async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) } });
  if (!response.ok) throw new Error((await readApiFailure(response)).message);
  return schema.parse(await response.json());
}
export const creditNotesApi = {
  invoiceHistory: (invoiceId: string) => request(`/api/invoices/${invoiceId}`, z.object({ totalPaid: z.string(), totalCredited: z.string().optional(), balanceDue: z.string() })),
  list: (invoiceId: string) => request(`/api/credit-notes?invoiceId=${encodeURIComponent(invoiceId)}`, creditNoteListResponseSchema),
  create: (input: CreateCreditNoteRequest, key: string) => request('/api/credit-notes', creditNoteSchema, createCreditNoteRequestSchema.parse(input), key),
  reverse: (id: string, input: ReverseCreditNoteRequest) => request(`/api/credit-notes/${id}/reverse`, creditNoteSchema, reverseCreditNoteRequestSchema.parse(input)),
  refund: (id: string, input: RefundCreditNoteRequest, key: string) => request(`/api/credit-notes/${id}/refunds`, creditNoteSchema, refundCreditNoteRequestSchema.parse(input), key),
  reverseRefund: (id: string, refundId: string, input: ReverseCreditNoteRequest) => request(`/api/credit-notes/${id}/refunds/${refundId}/reverse`, creditNoteSchema, reverseCreditNoteRequestSchema.parse(input)),
};
