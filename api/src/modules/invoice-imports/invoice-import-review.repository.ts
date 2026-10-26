import type { InvoiceImportExtractionDraft, InvoiceImportValidationIssue } from '@ledgercraft/contracts';
import { and, eq, ne } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customers } from '../../db/schema/customers';
import { importDocuments } from '../../db/schema/invoice-imports';
import { invoiceAttachments, invoices } from '../../db/schema/invoices';
import { billAttachments, bills, vendors } from '../../db/schema/purchases';

export async function saveExtraction(tx: Database, organisationId: string, id: string, draft: InvoiceImportExtractionDraft, issues: InvoiceImportValidationIssue[]) {
  const [row] = await tx.update(importDocuments).set({
    status: 'needs_review', extractionDraftJson: draft, extractionProvider: draft.provider,
    extractionMock: draft.mock, validationIssuesJson: issues, extractedAt: new Date(),
    direction: null, contactId: null, thirdPartyIssued: draft.thirdPartyIssued,
    externalIssuerName: draft.issuerName, externalIssuerGstNumber: draft.issuerGstNumber,
    externalNumber: draft.documentNumber, updatedAt: new Date(),
  }).where(and(eq(importDocuments.organisationId, organisationId), eq(importDocuments.id, id))).returning();
  return row;
}

export async function saveReview(tx: Database, organisationId: string, id: string, input: {
  draft: InvoiceImportExtractionDraft; issues: InvoiceImportValidationIssue[];
  direction?: 'sales' | 'purchase'; thirdPartyIssued?: boolean; contactId?: string | null;
}) {
  const [row] = await tx.update(importDocuments).set({
    extractionDraftJson: input.draft, validationIssuesJson: input.issues,
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.thirdPartyIssued !== undefined ? { thirdPartyIssued: input.thirdPartyIssued } : {}),
    ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
    externalIssuerName: input.draft.issuerName, externalIssuerGstNumber: input.draft.issuerGstNumber,
    externalNumber: input.draft.documentNumber, reviewedAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(importDocuments.organisationId, organisationId), eq(importDocuments.id, id))).returning();
  return row;
}

export async function contactSuggestions(tx: Database, organisationId: string, direction: 'SALES' | 'PURCHASE' | null, draft: InvoiceImportExtractionDraft) {
  if (direction === 'SALES') {
    const rows = await tx.select().from(customers).where(eq(customers.organisationId, organisationId));
    return rows.filter((row) => draft.issuerName && row.name.localeCompare(draft.issuerName, undefined, { sensitivity: 'accent' }) === 0)
      .map((row) => ({ contactType: 'customer' as const, contactId: row.id, name: row.name, gstNumber: null, matchedBy: 'name' as const }));
  }
  if (direction === 'PURCHASE') {
    const rows = await tx.select().from(vendors).where(eq(vendors.organisationId, organisationId));
    const suggestions: Array<{ contactType: 'vendor'; contactId: string; name: string; gstNumber: string | null; matchedBy: 'name' | 'gst_number' }> = [];
    for (const row of rows) {
      if (draft.issuerGstNumber && row.taxId?.replace(/\s/g, '') === draft.issuerGstNumber.replace(/\s/g, '')) {
        suggestions.push({ contactType: 'vendor', contactId: row.id, name: row.name, gstNumber: row.taxId, matchedBy: 'gst_number' });
      } else if (draft.issuerName && row.name.localeCompare(draft.issuerName, undefined, { sensitivity: 'accent' }) === 0) {
        suggestions.push({ contactType: 'vendor', contactId: row.id, name: row.name, gstNumber: row.taxId, matchedBy: 'name' });
      }
    }
    return suggestions;
  }
  return [];
}

export async function duplicateWarnings(tx: Database, organisationId: string, id: string, sha256: string, draft: InvoiceImportExtractionDraft) {
  const warnings: Array<{ kind: 'hash' | 'issuer_number' | 'issuer_date_total'; recordType: 'import' | 'invoice' | 'bill'; recordId: string; message: string }> = [];
  const imports = await tx.select().from(importDocuments).where(and(eq(importDocuments.organisationId, organisationId), ne(importDocuments.id, id)));
  for (const row of imports) {
    const other = row.extractionDraftJson as Partial<InvoiceImportExtractionDraft> | null;
    if (row.sha256 === sha256) warnings.push({ kind: 'hash', recordType: 'import', recordId: row.id, message: 'The same source file was uploaded previously' });
    else if (draft.issuerName && draft.documentNumber && other?.issuerName === draft.issuerName && other.documentNumber === draft.documentNumber) {
      warnings.push({ kind: 'issuer_number', recordType: 'import', recordId: row.id, message: 'An import has the same issuer and document number' });
    } else if (draft.issuerName && draft.issueDate && other?.issuerName === draft.issuerName && other.issueDate === draft.issueDate && other.total === draft.total) {
      warnings.push({ kind: 'issuer_date_total', recordType: 'import', recordId: row.id, message: 'An import has the same issuer, date, and total' });
    }
  }
  const invoiceRows = await tx.select().from(invoices).where(eq(invoices.organisationId, organisationId));
  for (const row of invoiceRows) {
    if (draft.issuerName && draft.documentNumber && row.externalIssuerName === draft.issuerName && row.externalNumber === draft.documentNumber) {
      warnings.push({ kind: 'issuer_number', recordType: 'invoice', recordId: row.id, message: 'An invoice has the same issuer and external number' });
    } else if (draft.issuerName && draft.issueDate && row.externalIssuerName === draft.issuerName && row.date === draft.issueDate && row.total === draft.total) {
      warnings.push({ kind: 'issuer_date_total', recordType: 'invoice', recordId: row.id, message: 'An invoice has the same issuer, date, and total' });
    }
  }
  const billRows = await tx.select().from(bills).where(eq(bills.organisationId, organisationId));
  for (const row of billRows) {
    if (draft.issuerName && draft.documentNumber && row.externalIssuerName === draft.issuerName && row.externalNumber === draft.documentNumber) {
      warnings.push({ kind: 'issuer_number', recordType: 'bill', recordId: row.id, message: 'A bill has the same issuer and external number' });
    } else if (draft.issuerName && draft.issueDate && row.externalIssuerName === draft.issuerName && row.issueDate === draft.issueDate && row.total === draft.total) {
      warnings.push({ kind: 'issuer_date_total', recordType: 'bill', recordId: row.id, message: 'A bill has the same issuer, date, and total' });
    }
  }
  return warnings;
}

export async function linkInvoice(tx: Database, input: {
  organisationId: string; userId: string; documentId: string; invoiceId: string; storageKey: string;
  filename: string; mimeType: string; size: number; issuerName: string | null; externalNumber: string | null; thirdPartyIssued: boolean;
}) {
  await tx.update(invoices).set({
    source: 'import', importDocumentId: input.documentId, externalIssuerName: input.issuerName,
    externalNumber: input.externalNumber, thirdPartyIssued: input.thirdPartyIssued, updatedAt: new Date(),
  }).where(and(eq(invoices.organisationId, input.organisationId), eq(invoices.id, input.invoiceId)));
  await tx.insert(invoiceAttachments).values({
    organisationId: input.organisationId, invoiceId: input.invoiceId, createdBy: input.userId,
    objectKey: input.storageKey, filename: input.filename, contentType: input.mimeType, size: input.size,
    role: 'source_document', locked: true,
  });
}

export async function linkBill(tx: Database, input: {
  organisationId: string; documentId: string; billId: string; storageKey: string;
  filename: string; mimeType: string; size: number; issuerName: string | null; externalNumber: string | null;
}) {
  await tx.update(bills).set({
    source: 'import', importDocumentId: input.documentId, externalIssuerName: input.issuerName,
    externalNumber: input.externalNumber, updatedAt: new Date(),
  }).where(and(eq(bills.organisationId, input.organisationId), eq(bills.id, input.billId)));
  await tx.insert(billAttachments).values({
    organisationId: input.organisationId, billId: input.billId, objectKey: input.storageKey,
    filename: input.filename, contentType: input.mimeType, size: input.size, role: 'source_document', locked: true,
  });
}

export async function markCommitted(tx: Database, organisationId: string, id: string, recordType: 'invoice' | 'bill', recordId: string) {
  await tx.update(importDocuments).set({ status: 'committed', committedRecordType: recordType, committedRecordId: recordId, updatedAt: new Date() })
    .where(and(eq(importDocuments.organisationId, organisationId), eq(importDocuments.id, id)));
}

