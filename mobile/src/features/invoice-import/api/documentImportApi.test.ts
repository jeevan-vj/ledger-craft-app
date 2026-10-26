import { apiRequest } from '@/features/auth/api/http';
import { documentImportApi } from './documentImportApi';

jest.mock('@/features/auth/api/http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

describe('documentImportApi', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('uploads one mobile source with an idempotency key and progress states', async () => {
    mockedRequest.mockResolvedValue({
      batch: { id: '11111111-1111-4111-8111-111111111111', status: 'uploaded', fileCount: 1, createdBy: '22222222-2222-4222-8222-222222222222', createdAt: '2026-10-26T00:00:00.000Z' },
      documents: [{ id: '33333333-3333-4333-8333-333333333333', batchId: '11111111-1111-4111-8111-111111111111', status: 'uploaded', originalFilename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 100, pageCount: 1, sha256: 'a'.repeat(64), uploadedBy: '22222222-2222-4222-8222-222222222222', uploadedAt: '2026-10-26T00:00:00.000Z', extractionDraft: null, direction: null, thirdPartyIssued: false, externalIssuerName: null, externalIssuerGstNumber: null, externalNumber: null, committedRecordType: null, committedRecordId: null, duplicateOfDocumentId: null }],
      duplicateWarnings: [],
    });
    const progress: number[] = [];
    const result = await documentImportApi.upload({ filename: 'invoice.pdf', contentType: 'application/pdf', contentBase64: 'JVBERg==' }, (value) => progress.push(value));

    expect(result.documents[0].originalFilename).toBe('invoice.pdf');
    expect(progress).toEqual([0, 0.2, 1]);
    expect(mockedRequest).toHaveBeenCalledWith('/api/invoice-imports', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
    }));
  });

  it('uses the draft and commit endpoints', async () => {
    mockedRequest.mockResolvedValueOnce({ documentId: '11111111-1111-4111-8111-111111111111' });
    await expect(documentImportApi.patchDraft('11111111-1111-4111-8111-111111111111', { direction: 'SALES' })).rejects.toBeDefined();
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/invoice-imports/11111111-1111-4111-8111-111111111111/draft', { method: 'PATCH', body: JSON.stringify({ direction: 'SALES' }) });

    mockedRequest.mockResolvedValueOnce({ documentId: '11111111-1111-4111-8111-111111111111', status: 'committed', recordType: 'invoice', recordId: '22222222-2222-4222-8222-222222222222' });
    await documentImportApi.commit('11111111-1111-4111-8111-111111111111', true);
    expect(mockedRequest).toHaveBeenLastCalledWith('/api/invoice-imports/11111111-1111-4111-8111-111111111111/commit', { method: 'POST', body: JSON.stringify({ acknowledgeDuplicates: true }) });
  });
});
