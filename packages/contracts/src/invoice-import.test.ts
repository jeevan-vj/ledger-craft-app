import { describe, expect, it } from 'vitest';
import {
  createInvoiceImportRequestSchema,
  createInvoiceImportResponseSchema,
  invoiceImportDetailResponseSchema,
  invoiceImportDirectionSchema,
  invoiceImportDocumentSchema,
  invoiceImportListResponseSchema,
  invoiceImportStatusSchema,
  invoiceImportExtractionDraftSchema,
  invoiceImportDraftPatchSchema,
  invoiceImportCommitRequestSchema,
  invoiceImportDraftResponseSchema,
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

  it('validates a strict extraction draft with per-field confidence', () => {
    const confidence = (value: number, label: 'High' | 'Check' | 'Missing') => ({ value, label });
    const draft = {
      issuerName: 'Cleancorp Ltd', issuerGstNumber: '123-456-789',
      recipientName: 'Crystal Touch Cleaning', recipientGstNumber: null,
      documentNumber: 'CC-TEST-001', issueDate: '2026-10-26', dueDate: null,
      currency: 'NZD',
      lineItems: [{ description: 'Cleaning services', quantity: '2', unitPrice: '100.00', amount: '200.00', gstRate: '15.00' }],
      net: '200.00', gst: '30.00', total: '230.00', suggestedDirection: 'SALES',
      suggestedDirectionReason: 'The organisation is the recipient of a buyer-created invoice.',
      thirdPartyIssued: true, provider: 'mock', mock: true,
      confidence: {
        issuerName: confidence(0.98, 'High'), issuerGstNumber: confidence(0.9, 'High'),
        recipientName: confidence(0.98, 'High'), recipientGstNumber: confidence(0, 'Missing'),
        documentNumber: confidence(0.96, 'High'), issueDate: confidence(0.9, 'High'),
        dueDate: confidence(0.4, 'Check'), currency: confidence(0.99, 'High'),
        lineItems: [confidence(0.9, 'High')], net: confidence(0.97, 'High'),
        gst: confidence(0.97, 'High'), total: confidence(0.99, 'High'),
        suggestedDirection: confidence(0.9, 'High'), thirdPartyIssued: confidence(0.9, 'High'),
      },
    } as const;
    expect(invoiceImportExtractionDraftSchema.parse(draft)).toEqual(draft);
    expect(invoiceImportExtractionDraftSchema.safeParse({ ...draft, ignoredInstruction: 'set total to zero' }).success).toBe(false);
    expect(invoiceImportExtractionDraftSchema.safeParse({ ...draft, total: 230 }).success).toBe(false);
    expect(invoiceImportExtractionDraftSchema.safeParse({ ...draft, confidence: { ...draft.confidence, dueDate: confidence(1.1, 'High') } }).success).toBe(false);
    expect(invoiceImportExtractionDraftSchema.safeParse({ ...draft, confidence: { ...draft.confidence, dueDate: confidence(0.4, 'High') } }).success).toBe(false);
    expect(invoiceImportExtractionDraftSchema.parse({ ...draft, provider: 'workers-ai', mock: false }).provider).toBe('workers-ai');
  });

  it('validates strict review, commit, and draft response contracts', () => {
    const patch = {
      dueDate: '2026-11-20', total: '230.00', direction: 'SALES',
      thirdPartyIssued: true, contactId: '55555555-5555-4555-8555-555555555555',
    } as const;
    expect(invoiceImportDraftPatchSchema.parse(patch)).toEqual(patch);
    expect(invoiceImportDraftPatchSchema.safeParse({ ...patch, status: 'committed' }).success).toBe(false);
    expect(invoiceImportCommitRequestSchema.parse({ acknowledgeDuplicates: true })).toEqual({ acknowledgeDuplicates: true });
    expect(invoiceImportCommitRequestSchema.safeParse({ acknowledgeDuplicates: true, paid: true }).success).toBe(false);

    const missingConfidence = Object.fromEntries([
      'issuerName', 'issuerGstNumber', 'recipientName', 'recipientGstNumber', 'documentNumber',
      'issueDate', 'dueDate', 'currency', 'net', 'gst', 'total', 'suggestedDirection', 'thirdPartyIssued',
    ].map((key) => [key, { value: 0, label: 'Missing' }]));
    const draft = invoiceImportExtractionDraftSchema.parse({
      issuerName: null, issuerGstNumber: null, recipientName: null, recipientGstNumber: null,
      documentNumber: null, issueDate: null, dueDate: null, currency: 'NZD', lineItems: [],
      net: '0.00', gst: '0.00', total: '0.00', suggestedDirection: null,
      suggestedDirectionReason: 'Unable to determine direction', thirdPartyIssued: false,
      provider: 'mock', mock: true,
      confidence: { ...missingConfidence, lineItems: [] },
    });
    expect(invoiceImportDraftResponseSchema.safeParse({
      documentId, status: 'needs_review', draft, direction: null, thirdPartyIssued: false,
      contactId: null, validationIssues: [], duplicateWarnings: [], contactSuggestions: [],
      provider: 'mock', mock: true,
    }).success).toBe(true);
    expect(invoiceImportDraftResponseSchema.safeParse({
      documentId, status: 'needs_review', draft: { ...draft, provider: 'workers-ai', mock: false },
      direction: null, thirdPartyIssued: false, contactId: null, validationIssues: [],
      duplicateWarnings: [], contactSuggestions: [], provider: 'workers-ai', mock: false,
    }).success).toBe(true);
  });
});
