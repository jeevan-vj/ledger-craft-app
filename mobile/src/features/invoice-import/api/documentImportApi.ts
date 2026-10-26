import {
  createInvoiceImportResponseSchema,
  invoiceImportCommitResponseSchema,
  invoiceImportDraftResponseSchema,
  type CreateInvoiceImportResponse,
  type InvoiceImportCommitResponse,
  type InvoiceImportDraftPatch,
  type InvoiceImportDraftResponse,
  type InvoiceImportUploadFile,
} from '@ledgercraft/contracts';
import { apiFetch, apiRequest, rejectFailedResponse } from '@/features/auth/api/http';
import { randomId } from '@/utils/id';
import { encode } from 'base64-arraybuffer';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export const documentImportApi = {
  async upload(file: InvoiceImportUploadFile, onProgress?: (progress: number) => void): Promise<CreateInvoiceImportResponse> {
    onProgress?.(0);
    const body = JSON.stringify({ files: [file] });
    onProgress?.(0.2);
    const response = await apiRequest<unknown>('/api/invoice-imports', {
      method: 'POST',
      headers: { 'Idempotency-Key': randomId() },
      body,
    });
    const parsed = createInvoiceImportResponseSchema.parse(response);
    onProgress?.(1);
    return parsed;
  },

  async extract(id: string): Promise<InvoiceImportDraftResponse> {
    return invoiceImportDraftResponseSchema.parse(await apiRequest<unknown>(`/api/invoice-imports/${id}/extract`, { method: 'POST', body: '{}' }));
  },

  async getDraft(id: string): Promise<InvoiceImportDraftResponse> {
    return invoiceImportDraftResponseSchema.parse(await apiRequest<unknown>(`/api/invoice-imports/${id}/draft`, { method: 'GET' }));
  },

  async patchDraft(id: string, patch: InvoiceImportDraftPatch): Promise<InvoiceImportDraftResponse> {
    return invoiceImportDraftResponseSchema.parse(await apiRequest<unknown>(`/api/invoice-imports/${id}/draft`, { method: 'PATCH', body: JSON.stringify(patch) }));
  },

  async commit(id: string, acknowledgeDuplicates: boolean): Promise<InvoiceImportCommitResponse> {
    return invoiceImportCommitResponseSchema.parse(await apiRequest<unknown>(`/api/invoice-imports/${id}/commit`, { method: 'POST', body: JSON.stringify({ acknowledgeDuplicates }) }));
  },

  async downloadOriginal(id: string, filename: string): Promise<string> {
    const response = await apiFetch(`/api/invoice-imports/${id}/file`, { method: 'GET' });
    if (!response.ok) await rejectFailedResponse(response);
    if (Platform.OS === 'web') return URL.createObjectURL(await response.blob());
    if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is unavailable.');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const uri = `${FileSystem.cacheDirectory}invoice-import-${id}-${safeName}`;
    await FileSystem.writeAsStringAsync(uri, encode(await response.arrayBuffer()), { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  },
};
