import { describe, expect, it } from 'vitest';
import {
  createInvoiceImportRequestSchema,
  createInvoiceImportResponseSchema,
  invoiceImportDetailResponseSchema,
  invoiceImportDirectionSchema,
  invoiceImportDocumentSchema,
  invoiceImportListResponseSchema,
  invoiceImportStatusSchema,
} from './invoice-import';

const documentId = '11111111-1111-4111-8111-111111111111';
const batchId = '22222222-2222-4222-8222-222222222222';
const uploaderId = '33333333-3333-4333-8333-333333333333';
const existingDocumentId = '44444444-4444-4444-8444-444444444444';

const document = {
  id: documentId,
  batchId,
  status: 'uploaded',
  originalFilename: 'Cleancorp invoice.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1_024,
  pageCount: 1,
  sha256: 'a'.repeat(64),
  uploadedBy: uploaderId,
  uploadedAt: '2026-10-26T01:02:03.000Z',
  extractionDraft: null,
  direction: 'sales',
  thirdPartyIssued: true,
  externalIssuerName: 'Cleancorp',
  externalIssuerGstNumber: '123-456-789',
  externalNumber: 'CT-2026-001',
  committedRecordType: null,
  committedRecordId: null,
  duplicateOfDocumentId: existingDocumentId,
} as const;

describe('invoice import contracts', () => {
  it('accepts only the Phase 1 document statuses and directions', () => {
    for (const status of ['uploaded', 'processing', 'needs_review', 'failed', 'committed', 'discarded']) {
      expect(invoiceImportStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(invoiceImportStatusSchema.safeParse('queued').success).toBe(false);

    expect(invoiceImportDirectionSchema.safeParse('sales').success).toBe(true);
    expect(invoiceImportDirectionSchema.safeParse('purchase').success).toBe(true);
    expect(invoiceImportDirectionSchema.safeParse('expense').success).toBe(false);
  });

  it('accepts a strict multi-file base64 upload without ownership fields', () => {
    const request = {
      files: [
        {
          filename: '../Cleancorp invoice.pdf',
          contentType: 'application/pdf',
          contentBase64: 'JVBERi0xLjQ=',
        },
        {
          filename: 'phone-photo.jpg',
          contentType: 'image/jpeg',
          contentBase64: '/9j/4AAQSkZJRg==',
        },
      ],
    };

    expect(createInvoiceImportRequestSchema.parse(request)).toEqual(request);
    expect(createInvoiceImportRequestSchema.safeParse({ ...request, organisationId: crypto.randomUUID() }).success).toBe(false);
    expect(createInvoiceImportRequestSchema.safeParse({ files: [{ ...request.files[0], bytes: [] }] }).success).toBe(false);
  });

  it('requires between one and ten upload files', () => {
    expect(createInvoiceImportRequestSchema.safeParse({ files: [] }).success).toBe(false);
    expect(createInvoiceImportRequestSchema.safeParse({
      files: Array.from({ length: 11 }, (_, index) => ({
        filename: `invoice-${index}.pdf`,
        contentType: 'application/pdf',
        contentBase64: 'JVBERi0xLjQ=',
      })),
    }).success).toBe(false);
  });

  it('validates document metadata, hashes, page counts, and linked records', () => {
    expect(invoiceImportDocumentSchema.parse(document)).toEqual(document);
    expect(invoiceImportDocumentSchema.safeParse({ ...document, sha256: 'not-a-hash' }).success).toBe(false);
    expect(invoiceImportDocumentSchema.safeParse({ ...document, pageCount: 0 }).success).toBe(false);
    expect(invoiceImportDocumentSchema.safeParse({
      ...document,
      committedRecordType: 'invoice',
      committedRecordId: null,
    }).success).toBe(false);
  });

  it('accepts upload, list, and detail envelopes with duplicate warnings', () => {
    const batch = {
      id: batchId,
      status: 'uploaded',
      fileCount: 1,
      createdBy: uploaderId,
      createdAt: '2026-10-26T01:02:03.000Z',
    } as const;
    const duplicateWarnings = [{
      documentId,
      existingDocumentId,
      sha256: 'a'.repeat(64),
    }];

    expect(createInvoiceImportResponseSchema.safeParse({ batch, documents: [document], duplicateWarnings }).success).toBe(true);
    expect(invoiceImportListResponseSchema.safeParse({ documents: [document] }).success).toBe(true);
    expect(invoiceImportDetailResponseSchema.safeParse({ document }).success).toBe(true);
  });

  it('strictly rejects unknown request and response fields', () => {
    expect(createInvoiceImportRequestSchema.safeParse({
      files: [{ filename: 'invoice.pdf', contentType: 'application/pdf', contentBase64: 'JVBERg==', objectKey: 'org/imports/a' }],
    }).success).toBe(false);
    expect(invoiceImportDetailResponseSchema.safeParse({ document, storageKey: 'org/imports/a.pdf' }).success).toBe(false);
  });
});
