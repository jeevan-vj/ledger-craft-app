import {
  invoiceImportBatchSchema,
  invoiceImportDocumentSchema,
  type InvoiceImportBatchDto,
  type InvoiceImportDocumentDto,
} from '@ledgercraft/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { importBatches, importDocumentEvents, importDocuments } from '../../db/schema/invoice-imports';
import { invoiceAttachments, invoices } from '../../db/schema/invoices';
import { billAttachments, bills } from '../../db/schema/purchases';

function batchDto(row: typeof importBatches.$inferSelect): InvoiceImportBatchDto {
  return invoiceImportBatchSchema.parse({
    id: row.id,
    status: row.status,
    fileCount: row.fileCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  });
}

export function documentDto(row: typeof importDocuments.$inferSelect): InvoiceImportDocumentDto {
  const draft = row.extractionDraftJson;
  return invoiceImportDocumentSchema.parse({
    id: row.id,
    batchId: row.batchId,
    status: row.status,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    sha256: row.sha256,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt.toISOString(),
    extractionDraft: typeof draft === 'object' && draft !== null && !Array.isArray(draft) ? draft : null,
    direction: row.direction,
    thirdPartyIssued: row.thirdPartyIssued,
    externalIssuerName: row.externalIssuerName,
    externalIssuerGstNumber: row.externalIssuerGstNumber,
    externalNumber: row.externalNumber,
    committedRecordType: row.committedRecordType,
    committedRecordId: row.committedRecordId,
    duplicateOfDocumentId: row.duplicateOfDocumentId,
  });
}

export async function insertBatch(
  tx: Database,
  values: { id: string; organisationId: string; createdBy: string; fileCount: number },
): Promise<InvoiceImportBatchDto> {
  const [row] = await tx.insert(importBatches).values(values).returning();
  return batchDto(row!);
}

export async function findFirstByHash(
  tx: Database,
  organisationId: string,
  sha256: string,
): Promise<typeof importDocuments.$inferSelect | undefined> {
  const [row] = await tx.select().from(importDocuments)
    .where(and(eq(importDocuments.organisationId, organisationId), eq(importDocuments.sha256, sha256)))
    .orderBy(asc(importDocuments.uploadedAt), asc(importDocuments.id));
  return row;
}

export async function insertDocument(
  tx: Database,
  values: typeof importDocuments.$inferInsert,
): Promise<InvoiceImportDocumentDto> {
  const [row] = await tx.insert(importDocuments).values(values).returning();
  return documentDto(row!);
}

export async function listDocuments(tx: Database, organisationId: string): Promise<InvoiceImportDocumentDto[]> {
  const rows = await tx.select().from(importDocuments)
    .where(eq(importDocuments.organisationId, organisationId))
    .orderBy(desc(importDocuments.uploadedAt), desc(importDocuments.id));
  return rows.map(documentDto);
}

export async function getDocumentRow(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<typeof importDocuments.$inferSelect | undefined> {
  const [row] = await tx.select().from(importDocuments)
    .where(and(eq(importDocuments.organisationId, organisationId), eq(importDocuments.id, id)));
  return row;
}

export async function insertEvent(
  tx: Database,
  input: {
    organisationId: string;
    documentId: string;
    actorUserId: string;
    action: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(importDocumentEvents).values({
    organisationId: input.organisationId,
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: input.action,
    detailsJson: input.details ?? null,
  });
}

export async function documentHasLinkedRecord(
  tx: Database,
  organisationId: string,
  documentId: string,
  storageKey: string,
): Promise<boolean> {
  const [invoice] = await tx.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.organisationId, organisationId), eq(invoices.importDocumentId, documentId)));
  if (invoice) return true;
  const [bill] = await tx.select({ id: bills.id }).from(bills)
    .where(and(eq(bills.organisationId, organisationId), eq(bills.importDocumentId, documentId)));
  if (bill) return true;
  const [invoiceAttachment] = await tx.select({ id: invoiceAttachments.id }).from(invoiceAttachments)
    .where(and(
      eq(invoiceAttachments.organisationId, organisationId),
      eq(invoiceAttachments.objectKey, storageKey),
      eq(invoiceAttachments.role, 'source_document'),
      eq(invoiceAttachments.locked, true),
    ));
  if (invoiceAttachment) return true;
  const [billAttachment] = await tx.select({ id: billAttachments.id }).from(billAttachments)
    .where(and(
      eq(billAttachments.organisationId, organisationId),
      eq(billAttachments.objectKey, storageKey),
      eq(billAttachments.role, 'source_document'),
      eq(billAttachments.locked, true),
    ));
  return Boolean(billAttachment);
}

export async function discardDocument(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<InvoiceImportDocumentDto> {
  const [row] = await tx.update(importDocuments).set({ status: 'discarded', updatedAt: new Date() })
    .where(and(eq(importDocuments.organisationId, organisationId), eq(importDocuments.id, id)))
    .returning();
  return documentDto(row!);
}
