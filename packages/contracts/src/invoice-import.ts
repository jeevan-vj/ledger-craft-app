import { z } from 'zod';

const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hex digest');

export const invoiceImportStatusSchema = z.enum([
  'uploaded',
  'processing',
  'needs_review',
  'failed',
  'committed',
  'discarded',
]);

export const invoiceImportDirectionSchema = z.enum(['sales', 'purchase']);

export const invoiceImportMimeTypeSchema = z.enum([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const invoiceImportCommittedRecordTypeSchema = z.enum(['invoice', 'bill']);

export const invoiceImportBatchSchema = z.object({
  id: z.string().uuid(),
  status: invoiceImportStatusSchema,
  fileCount: z.number().int().min(1).max(10),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
}).strict();

export const invoiceImportDocumentSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  status: invoiceImportStatusSchema,
  originalFilename: z.string().min(1).max(255),
  mimeType: invoiceImportMimeTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive().nullable(),
  sha256: sha256HexSchema,
  uploadedBy: z.string().uuid(),
  uploadedAt: z.string().datetime(),
  extractionDraft: z.record(z.unknown()).nullable(),
  direction: invoiceImportDirectionSchema.nullable(),
  thirdPartyIssued: z.boolean(),
  externalIssuerName: z.string().nullable(),
  externalIssuerGstNumber: z.string().nullable(),
  externalNumber: z.string().nullable(),
  committedRecordType: invoiceImportCommittedRecordTypeSchema.nullable(),
  committedRecordId: z.string().uuid().nullable(),
  duplicateOfDocumentId: z.string().uuid().nullable(),
}).strict().superRefine((value, ctx) => {
  if ((value.committedRecordType === null) !== (value.committedRecordId === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['committedRecordId'],
      message: 'Committed record type and id must both be set or both be null',
    });
  }
});

export const invoiceImportUploadFileSchema = z.object({
  filename: z.string().min(1).max(1_024),
  contentType: invoiceImportMimeTypeSchema,
  contentBase64: z.string().min(1),
}).strict();

export const createInvoiceImportRequestSchema = z.object({
  files: z.array(invoiceImportUploadFileSchema).min(1).max(10),
  direction: invoiceImportDirectionSchema.nullable().optional(),
}).strict();

export const invoiceImportDuplicateWarningSchema = z.object({
  documentId: z.string().uuid(),
  existingDocumentId: z.string().uuid(),
  sha256: sha256HexSchema,
}).strict();

export const createInvoiceImportResponseSchema = z.object({
  batch: invoiceImportBatchSchema,
  documents: z.array(invoiceImportDocumentSchema).min(1).max(10),
  duplicateWarnings: z.array(invoiceImportDuplicateWarningSchema),
}).strict();

export const invoiceImportListResponseSchema = z.object({
  documents: z.array(invoiceImportDocumentSchema),
}).strict();

export const invoiceImportDetailResponseSchema = z.object({
  document: invoiceImportDocumentSchema,
}).strict();

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
const decimalTextSchema = z.string().regex(/^\d+(?:\.\d+)?$/, 'Expected a non-negative decimal string').max(40);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date').nullable();

export const invoiceImportReviewDirectionSchema = z.enum(['SALES', 'PURCHASE']);
export const invoiceImportConfidenceLabelSchema = z.enum(['High', 'Check', 'Missing']);
export const invoiceImportConfidenceSchema = z.object({
  value: z.number().min(0).max(1),
  label: invoiceImportConfidenceLabelSchema,
}).strict().superRefine((confidence, ctx) => {
  const expected = confidence.value === 0 ? 'Missing' : confidence.value >= 0.85 ? 'High' : 'Check';
  if (confidence.label !== expected) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['label'], message: `Expected ${expected} for this confidence` });
  }
});

export const invoiceImportExtractedLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: decimalTextSchema,
  unitPrice: decimalTextSchema,
  amount: decimalTextSchema,
  gstRate: decimalTextSchema,
}).strict();

export const invoiceImportExtractionDraftSchema = z.object({
  issuerName: nullableText(200),
  issuerGstNumber: nullableText(40),
  recipientName: nullableText(200),
  recipientGstNumber: nullableText(40),
  documentNumber: nullableText(100),
  issueDate: isoDateSchema,
  dueDate: isoDateSchema,
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default('NZD'),
  lineItems: z.array(invoiceImportExtractedLineSchema).max(200),
  net: decimalTextSchema,
  gst: decimalTextSchema,
  total: decimalTextSchema,
  suggestedDirection: invoiceImportReviewDirectionSchema.nullable(),
  suggestedDirectionReason: z.string().trim().min(1).max(500),
  thirdPartyIssued: z.boolean(),
  provider: z.enum(['openai', 'xai', 'mock']),
  mock: z.boolean(),
  confidence: z.object({
    issuerName: invoiceImportConfidenceSchema,
    issuerGstNumber: invoiceImportConfidenceSchema,
    recipientName: invoiceImportConfidenceSchema,
    recipientGstNumber: invoiceImportConfidenceSchema,
    documentNumber: invoiceImportConfidenceSchema,
    issueDate: invoiceImportConfidenceSchema,
    dueDate: invoiceImportConfidenceSchema,
    currency: invoiceImportConfidenceSchema,
    lineItems: z.array(invoiceImportConfidenceSchema).max(200),
    net: invoiceImportConfidenceSchema,
    gst: invoiceImportConfidenceSchema,
    total: invoiceImportConfidenceSchema,
    suggestedDirection: invoiceImportConfidenceSchema,
    thirdPartyIssued: invoiceImportConfidenceSchema,
  }).strict(),
}).strict();

export const invoiceImportValidationIssueSchema = z.object({
  code: z.enum(['totals_mismatch', 'line_amount_mismatch', 'missing_required_field', 'invalid_date']),
  path: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  blocking: z.boolean(),
  expected: z.string().max(100).optional(),
  actual: z.string().max(100).optional(),
}).strict();

export const invoiceImportDraftPatchSchema = z.object({
  issuerName: nullableText(200).optional(),
  issuerGstNumber: nullableText(40).optional(),
  recipientName: nullableText(200).optional(),
  recipientGstNumber: nullableText(40).optional(),
  documentNumber: nullableText(100).optional(),
  issueDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  lineItems: z.array(invoiceImportExtractedLineSchema).max(200).optional(),
  net: decimalTextSchema.optional(),
  gst: decimalTextSchema.optional(),
  total: decimalTextSchema.optional(),
  direction: invoiceImportReviewDirectionSchema.optional(),
  thirdPartyIssued: z.boolean().optional(),
  contactId: z.string().uuid().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one review field is required');

export const invoiceImportCommitRequestSchema = z.object({
  acknowledgeDuplicates: z.boolean().optional().default(false),
}).strict();

export const invoiceImportDuplicateReviewWarningSchema = z.object({
  kind: z.enum(['hash', 'issuer_number', 'issuer_date_total']),
  recordType: z.enum(['import', 'invoice', 'bill']),
  recordId: z.string().uuid(),
  message: z.string().min(1).max(500),
}).strict();

export const invoiceImportContactSuggestionSchema = z.object({
  contactType: z.enum(['customer', 'vendor']),
  contactId: z.string().uuid(),
  name: z.string().min(1).max(200),
  gstNumber: z.string().max(40).nullable(),
  matchedBy: z.enum(['name', 'gst_number']),
}).strict();

export const invoiceImportDraftResponseSchema = z.object({
  documentId: z.string().uuid(),
  status: invoiceImportStatusSchema,
  draft: invoiceImportExtractionDraftSchema,
  direction: invoiceImportReviewDirectionSchema.nullable(),
  thirdPartyIssued: z.boolean(),
  contactId: z.string().uuid().nullable(),
  validationIssues: z.array(invoiceImportValidationIssueSchema),
  duplicateWarnings: z.array(invoiceImportDuplicateReviewWarningSchema),
  contactSuggestions: z.array(invoiceImportContactSuggestionSchema),
  provider: z.enum(['openai', 'xai', 'mock']),
  mock: z.boolean(),
}).strict();

export const invoiceImportCommitResponseSchema = z.object({
  documentId: z.string().uuid(),
  status: z.literal('committed'),
  recordType: invoiceImportCommittedRecordTypeSchema,
  recordId: z.string().uuid(),
}).strict();

export const invoiceImportErrorCodeSchema = z.enum([
  'EXTRACTION_PROVIDER_UNAVAILABLE', 'DIRECTION_REQUIRED', 'TOTALS_MISMATCH',
  'DUPLICATE_WARNING', 'IMPORT_ALREADY_COMMITTED', 'IMPORT_DOCUMENT_LINKED',
]);

export type InvoiceImportStatus = z.infer<typeof invoiceImportStatusSchema>;
export type InvoiceImportDirection = z.infer<typeof invoiceImportDirectionSchema>;
export type InvoiceImportMimeType = z.infer<typeof invoiceImportMimeTypeSchema>;
export type InvoiceImportCommittedRecordType = z.infer<typeof invoiceImportCommittedRecordTypeSchema>;
export type InvoiceImportBatchDto = z.infer<typeof invoiceImportBatchSchema>;
export type InvoiceImportDocumentDto = z.infer<typeof invoiceImportDocumentSchema>;
export type InvoiceImportUploadFile = z.infer<typeof invoiceImportUploadFileSchema>;
export type CreateInvoiceImportRequest = z.infer<typeof createInvoiceImportRequestSchema>;
export type InvoiceImportDuplicateWarning = z.infer<typeof invoiceImportDuplicateWarningSchema>;
export type CreateInvoiceImportResponse = z.infer<typeof createInvoiceImportResponseSchema>;
export type InvoiceImportListResponse = z.infer<typeof invoiceImportListResponseSchema>;
export type InvoiceImportDetailResponse = z.infer<typeof invoiceImportDetailResponseSchema>;
export type InvoiceImportReviewDirection = z.infer<typeof invoiceImportReviewDirectionSchema>;
export type InvoiceImportConfidence = z.infer<typeof invoiceImportConfidenceSchema>;
export type InvoiceImportExtractedLine = z.infer<typeof invoiceImportExtractedLineSchema>;
export type InvoiceImportExtractionDraft = z.infer<typeof invoiceImportExtractionDraftSchema>;
export type InvoiceImportValidationIssue = z.infer<typeof invoiceImportValidationIssueSchema>;
export type InvoiceImportDraftPatch = z.infer<typeof invoiceImportDraftPatchSchema>;
export type InvoiceImportCommitRequest = z.infer<typeof invoiceImportCommitRequestSchema>;
export type InvoiceImportDraftResponse = z.infer<typeof invoiceImportDraftResponseSchema>;
export type InvoiceImportCommitResponse = z.infer<typeof invoiceImportCommitResponseSchema>;
export type InvoiceImportErrorCode = z.infer<typeof invoiceImportErrorCodeSchema>;
