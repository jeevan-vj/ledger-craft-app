import {
  createInvoiceImportResponseSchema,
  invoiceImportDetailResponseSchema,
  invoiceImportListResponseSchema,
  type CreateInvoiceImportRequest,
  type CreateInvoiceImportResponse,
  type InvoiceImportDetailResponse,
  type InvoiceImportDocumentDto,
  type InvoiceImportListResponse,
} from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import type { FileStorage, StoredFile } from '../storage/file-storage';
import { assertKeyOwned } from '../storage/keys';
import {
  decodeInvoiceImportBase64,
  invoiceImportMaxBytes,
  sanitizeImportFilename,
  validateInvoiceImportFile,
  type InvoiceImportMimeType,
} from './invoice-import-validation';
import * as repo from './invoice-imports.repository';

const uploadWindows = new Map<string, { startedAt: number; count: number }>();
const UPLOADS_PER_MINUTE = 10;

// TODO(issue #94): move this counter into the organisation Durable Object so it is shared across isolates.
function enforceUploadRateLimit(userId: string, now = Date.now()): void {
  const window = uploadWindows.get(userId);
  if (!window || now - window.startedAt >= 60_000) {
    uploadWindows.set(userId, { startedAt: now, count: 1 });
    return;
  }
  if (window.count >= UPLOADS_PER_MINUTE) {
    throw apiError(429, 'RATE_LIMITED', 'Too many invoice import uploads; try again shortly');
  }
  window.count += 1;
}

function extensionFor(mimeType: InvoiceImportMimeType): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'heic';
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type PreparedFile = {
  id: string;
  filename: string;
  mimeType: InvoiceImportMimeType;
  bytes: Uint8Array;
  pageCount: number | null;
  sha256: string;
};

async function prepareFiles(input: CreateInvoiceImportRequest, storageMaxBytes: number): Promise<PreparedFile[]> {
  const maxBytes = invoiceImportMaxBytes(storageMaxBytes);
  return Promise.all(input.files.map(async (file) => {
    const bytes = decodeInvoiceImportBase64(file.contentBase64, maxBytes);
    const validation = validateInvoiceImportFile({
      bytes,
      declaredContentType: file.contentType,
      maxBytes,
    });
    return {
      id: crypto.randomUUID(),
      filename: sanitizeImportFilename(file.filename),
      mimeType: validation.mimeType,
      bytes,
      pageCount: validation.pageCount,
      sha256: await sha256(bytes),
    };
  }));
}

export async function createInvoiceImportForUser(
  db: Database,
  userId: string,
  storage: FileStorage,
  input: CreateInvoiceImportRequest,
): Promise<CreateInvoiceImportResponse> {
  enforceUploadRateLimit(userId);
  const prepared = await prepareFiles(input, storage.maxBytes);
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const batchId = crypto.randomUUID();
    const batch = await repo.insertBatch(tx, {
      id: batchId,
      organisationId: ctx.organisationId,
      createdBy: ctx.userId,
      fileCount: prepared.length,
    });
    const documents: InvoiceImportDocumentDto[] = [];
    const duplicateWarnings: CreateInvoiceImportResponse['duplicateWarnings'] = [];

    for (const file of prepared) {
      const duplicate = await repo.findFirstByHash(tx, ctx.organisationId, file.sha256);
      const storageKey = `${ctx.organisationId}/imports/${file.id}.${extensionFor(file.mimeType)}`;
      assertKeyOwned(storageKey, ctx.organisationId);
      await storage.put({
        key: storageKey,
        contentType: file.mimeType,
        bytes: file.bytes,
        sha256: file.sha256,
      });
      const document = await repo.insertDocument(tx, {
        id: file.id,
        organisationId: ctx.organisationId,
        batchId,
        originalFilename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.bytes.byteLength,
        pageCount: file.pageCount,
        sha256: file.sha256,
        storageKey,
        uploadedBy: ctx.userId,
        direction: input.direction ?? null,
        duplicateOfDocumentId: duplicate?.id ?? null,
      });
      await repo.insertEvent(tx, {
        organisationId: ctx.organisationId,
        documentId: document.id,
        actorUserId: ctx.userId,
        action: 'uploaded',
        details: { batchId, mimeType: file.mimeType, sizeBytes: file.bytes.byteLength },
      });
      documents.push(document);
      if (duplicate) duplicateWarnings.push({
        documentId: document.id,
        existingDocumentId: duplicate.id,
        sha256: file.sha256,
      });
    }
    return createInvoiceImportResponseSchema.parse({ batch, documents, duplicateWarnings });
  });
}

export async function listInvoiceImportsForUser(db: Database, userId: string): Promise<InvoiceImportListResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => invoiceImportListResponseSchema.parse({
    documents: await repo.listDocuments(tx, ctx.organisationId),
  }));
}

export async function getInvoiceImportForUser(
  db: Database,
  userId: string,
  id: string,
): Promise<InvoiceImportDetailResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getDocumentRow(tx, ctx.organisationId, id);
    if (!row) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
    await repo.insertEvent(tx, {
      organisationId: ctx.organisationId,
      documentId: row.id,
      actorUserId: ctx.userId,
      action: 'metadata_viewed',
    });
    return invoiceImportDetailResponseSchema.parse({ document: repo.documentDto(row) });
  });
}

export async function downloadInvoiceImportForUser(
  db: Database,
  userId: string,
  storage: FileStorage,
  id: string,
): Promise<{ document: InvoiceImportDocumentDto; file: StoredFile }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getDocumentRow(tx, ctx.organisationId, id);
    if (!row) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
    assertKeyOwned(row.storageKey, ctx.organisationId);
    const file = await storage.get(row.storageKey);
    if (!file) throw apiError(404, 'NOT_FOUND', 'Invoice import file not found');
    await repo.insertEvent(tx, {
      organisationId: ctx.organisationId,
      documentId: row.id,
      actorUserId: ctx.userId,
      action: 'file_downloaded',
    });
    return { document: repo.documentDto(row), file };
  });
}

export async function discardInvoiceImportForUser(
  db: Database,
  userId: string,
  id: string,
): Promise<InvoiceImportDetailResponse> {
  const result = await withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getDocumentRow(tx, ctx.organisationId, id);
    if (!row) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
    const linked = Boolean(row.committedRecordId)
      || await repo.documentHasLinkedRecord(tx, ctx.organisationId, row.id, row.storageKey);
    await repo.insertEvent(tx, {
      organisationId: ctx.organisationId,
      documentId: row.id,
      actorUserId: ctx.userId,
      action: 'delete_attempted',
      details: { blocked: linked },
    });
    if (linked) return { blocked: true as const };
    const document = row.status === 'discarded' ? repo.documentDto(row) : await repo.discardDocument(tx, ctx.organisationId, row.id);
    await repo.insertEvent(tx, {
      organisationId: ctx.organisationId,
      documentId: row.id,
      actorUserId: ctx.userId,
      action: 'discarded',
    });
    return { blocked: false as const, document };
  });
  if (result.blocked) {
    throw apiError(409, 'IMPORT_DOCUMENT_LINKED', 'Invoice import is linked to an invoice, bill, or locked source document');
  }
  return invoiceImportDetailResponseSchema.parse({ document: result.document });
}
