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
