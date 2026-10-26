import type {
  CreateInvoiceImportResponse,
  InvoiceImportCommitResponse,
  InvoiceImportDraftPatch,
  InvoiceImportDraftResponse,
  InvoiceImportMimeType,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export class InvoiceImportApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'InvoiceImportApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new InvoiceImportApiError(failure.message, failure.status, failure.code);
  }
  return response.json() as Promise<T>;
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export const invoiceImportApi = {
  async upload(file: File): Promise<CreateInvoiceImportResponse> {
    return request('/api/invoice-imports', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ files: [{ filename: file.name, contentType: file.type as InvoiceImportMimeType, contentBase64: await fileToBase64(file) }] }),
    });
  },
  extract(id: string) {
    return request(`/api/invoice-imports/${id}/extract`, { method: 'POST', body: '{}' });
  },
  getDraft(id: string) {
    return request<InvoiceImportDraftResponse>(`/api/invoice-imports/${id}/draft`);
  },
  patchDraft(id: string, input: InvoiceImportDraftPatch) {
    return request<InvoiceImportDraftResponse>(`/api/invoice-imports/${id}/draft`, { method: 'PATCH', body: JSON.stringify(input) });
  },
  commit(id: string, acknowledgeDuplicates: boolean) {
    return request<InvoiceImportCommitResponse>(`/api/invoice-imports/${id}/commit`, { method: 'POST', body: JSON.stringify({ acknowledgeDuplicates }) });
  },
  async original(id: string): Promise<Blob> {
    const response = await fetch(`/api/invoice-imports/${id}/file`, { credentials: 'include' });
    if (!response.ok) {
      const failure = await readApiFailure(response);
      throw new InvoiceImportApiError(failure.message, failure.status, failure.code);
    }
    return response.blob();
  },
};

