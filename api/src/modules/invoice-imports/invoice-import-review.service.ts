import {
  invoiceImportCommitResponseSchema,
  invoiceImportDraftResponseSchema,
  invoiceImportExtractionDraftSchema,
  invoiceImportValidationIssueSchema,
  type InvoiceImportCommitRequest,
  type InvoiceImportDraftPatch,
  type InvoiceImportDraftResponse,
  type InvoiceImportExtractionDraft,
} from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as profileRepo from '../business-profile/business-profile.repository';
import { currencyRepository, resolveDocumentCurrency } from '../currency/currency.service';
import { createInvoiceInTx } from '../invoices/invoices.service';
import * as purchaseRepo from '../purchases/purchases.repository';
import type { FileStorage } from '../storage/file-storage';
import { recomputeAndValidateDraft } from './draft-validation';
import type { InvoiceImportExtractionProvider } from './extraction';
import * as reviewRepo from './invoice-import-review.repository';
import * as repo from './invoice-imports.repository';

const extractionWindows = new Map<string, { startedAt: number; count: number }>();
const EXTRACTIONS_PER_MINUTE = 5;

function enforceExtractionRateLimit(key: string, now = Date.now()) {
  const window = extractionWindows.get(key);
  if (!window || now - window.startedAt >= 60_000) {
    extractionWindows.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (window.count >= EXTRACTIONS_PER_MINUTE) throw apiError(429, 'RATE_LIMITED', 'Too many extraction requests; try again shortly');
  window.count += 1;
}

function draftFromRow(row: Awaited<ReturnType<typeof repo.getDocumentRow>>): InvoiceImportExtractionDraft {
  if (!row) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
  const parsed = invoiceImportExtractionDraftSchema.safeParse(row.extractionDraftJson);
  if (!parsed.success) throw apiError(409, 'EXTRACTION_REQUIRED', 'Extract this document before review');
  return parsed.data;
}

function issuesFromRow(row: NonNullable<Awaited<ReturnType<typeof repo.getDocumentRow>>>) {
  const parsed = invoiceImportValidationIssueSchema.array().safeParse(row.validationIssuesJson);
  return parsed.success ? parsed.data : [];
}

async function responseForRow(tx: Database, organisationId: string, row: NonNullable<Awaited<ReturnType<typeof repo.getDocumentRow>>>): Promise<InvoiceImportDraftResponse> {
  const draft = draftFromRow(row);
  const direction = row.direction === 'sales' ? 'SALES' : row.direction === 'purchase' ? 'PURCHASE' : null;
  const suggested = direction ?? draft.suggestedDirection;
  return invoiceImportDraftResponseSchema.parse({
    documentId: row.id, status: row.status, draft, direction, thirdPartyIssued: row.thirdPartyIssued,
    contactId: row.contactId ?? null, validationIssues: issuesFromRow(row),
    duplicateWarnings: await reviewRepo.duplicateWarnings(tx, organisationId, row.id, row.sha256, draft),
    contactSuggestions: await reviewRepo.contactSuggestions(tx, organisationId, suggested, draft),
    provider: draft.provider, mock: draft.mock,
  });
}

export async function extractInvoiceImportForUser(
  db: Database, userId: string, storage: FileStorage, extractor: InvoiceImportExtractionProvider, id: string,
) {
  const prepared = await withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getDocumentRow(tx, ctx.organisationId, id);
    if (!row) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
    if (row.status === 'committed' || row.status === 'discarded') throw apiError(409, 'IMPORT_NOT_REVIEWABLE', 'Invoice import cannot be extracted in its current state');
    const profile = await profileRepo.getBusinessProfile(tx, ctx.organisationId);
    return { row, organisationId: ctx.organisationId, userId: ctx.userId, organisationName: profile?.name ?? 'Organisation', gstNumber: profile?.taxId ?? undefined };
  });
  enforceExtractionRateLimit(`${prepared.organisationId}:${prepared.userId}`);
  const file = await storage.get(prepared.row.storageKey);
  if (!file) throw apiError(404, 'NOT_FOUND', 'Invoice import file not found');
  const draft = await extractor.extractDocument({
    bytes: file.bytes, mimeType: prepared.row.mimeType, filename: prepared.row.originalFilename, sha256: prepared.row.sha256,
  }, { organisationName: prepared.organisationName, gstNumber: prepared.gstNumber });
  const { issues } = recomputeAndValidateDraft(draft);
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const current = await repo.getDocumentRow(tx, ctx.organisationId, id);
    if (!current) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
    if (current.status === 'committed' || current.status === 'discarded') throw apiError(409, 'IMPORT_NOT_REVIEWABLE', 'Invoice import cannot be extracted in its current state');
    const row = await reviewRepo.saveExtraction(tx, ctx.organisationId, id, draft, issues);
    await repo.insertEvent(tx, { organisationId: ctx.organisationId, documentId: id, actorUserId: ctx.userId, action: 'extracted', details: { provider: draft.provider, mock: draft.mock, validationIssueCount: issues.length } });
    return responseForRow(tx, ctx.organisationId, row!);
  });
}

export async function getInvoiceImportDraftForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getDocumentRow(tx, ctx.organisationId, id);
    if (!row) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
    return responseForRow(tx, ctx.organisationId, row);
  });
}

export async function patchInvoiceImportDraftForUser(db: Database, userId: string, id: string, input: InvoiceImportDraftPatch) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getDocumentRow(tx, ctx.organisationId, id);
    if (!row) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
    if (row.status === 'committed' || row.status === 'discarded') throw apiError(409, 'IMPORT_NOT_REVIEWABLE', 'Invoice import cannot be reviewed in its current state');
    const draft = draftFromRow(row);
    const draftPatch = { ...input } as Record<string, unknown>;
    delete draftPatch.direction; delete draftPatch.thirdPartyIssued; delete draftPatch.contactId;
    const reviewedDraft = invoiceImportExtractionDraftSchema.parse({ ...draft, ...draftPatch });
    const { issues } = recomputeAndValidateDraft(reviewedDraft);
    const updated = await reviewRepo.saveReview(tx, ctx.organisationId, id, {
      draft: reviewedDraft, issues,
      ...(input.direction ? { direction: input.direction.toLowerCase() as 'sales' | 'purchase' } : {}),
      ...(input.thirdPartyIssued !== undefined ? { thirdPartyIssued: input.thirdPartyIssued } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
    });
    await repo.insertEvent(tx, { organisationId: ctx.organisationId, documentId: id, actorUserId: ctx.userId, action: 'reviewed', details: { fields: Object.keys(input).sort(), validationIssueCount: issues.length } });
    return responseForRow(tx, ctx.organisationId, updated!);
  });
}

export async function commitInvoiceImportForUser(db: Database, userId: string, id: string, input: InvoiceImportCommitRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const row = await repo.getDocumentRow(tx, ctx.organisationId, id);
    if (!row) throw apiError(404, 'NOT_FOUND', 'Invoice import not found');
    if (row.status === 'committed') throw apiError(409, 'IMPORT_ALREADY_COMMITTED', 'Invoice import was already committed');
    const draft = draftFromRow(row);
    if (!row.direction) throw apiError(422, 'DIRECTION_REQUIRED', 'Choose SALES or PURCHASE before commit');
    const { computed, issues } = recomputeAndValidateDraft(draft);
    if (issues.some((issue) => issue.blocking)) throw apiError(422, 'TOTALS_MISMATCH', 'Correct the extracted fields before commit');
    const warnings = await reviewRepo.duplicateWarnings(tx, ctx.organisationId, row.id, row.sha256, draft);
    if (warnings.length && !input.acknowledgeDuplicates) throw apiError(409, 'DUPLICATE_WARNING', 'Review and acknowledge duplicate warnings before commit');
    if (!row.contactId) throw apiError(422, 'CONTACT_REQUIRED', 'Choose a customer or vendor before commit');
    const issueDate = draft.issueDate!;
    const dueDate = draft.dueDate ?? issueDate;
    let recordType: 'invoice' | 'bill';
    let recordId: string;
    if (row.direction === 'sales') {
      const invoice = await createInvoiceInTx(tx, ctx, {
        customerId: row.contactId, externalNumber: draft.documentNumber,
        date: issueDate, dueDate, currency: draft.currency, taxInclusive: false, status: 'draft',
        items: draft.lineItems.map((line) => ({
          description: line.description, quantity: line.quantity, rate: line.unitPrice,
          taxes: [{ id: 'import-gst', name: 'GST', rate: line.gstRate }],
        })),
      });
      if (invoice.total !== computed.total) throw apiError(422, 'TOTALS_MISMATCH', 'Imported invoice totals do not match domain totals');
      await reviewRepo.linkInvoice(tx, {
        organisationId: ctx.organisationId, userId: ctx.userId, documentId: row.id, invoiceId: invoice.id,
        storageKey: row.storageKey, filename: row.originalFilename, mimeType: row.mimeType, size: row.sizeBytes,
        issuerName: draft.issuerName, externalNumber: draft.documentNumber, thirdPartyIssued: row.thirdPartyIssued,
      });
      recordType = 'invoice'; recordId = invoice.id;
    } else {
      const vendor = await purchaseRepo.getVendor(tx, ctx.organisationId, row.contactId);
      if (!vendor) throw apiError(422, 'CONTACT_REQUIRED', 'Selected vendor was not found');
      const resolved = await resolveDocumentCurrency(tx, ctx.organisationId, draft.currency, issueDate);
      const bill = await purchaseRepo.insertBill(tx, ctx, {
        vendorId: row.contactId, vendorReference: draft.documentNumber, issueDate, dueDate,
        currency: resolved.currency.code, taxInclusive: false,
        lines: draft.lineItems.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.gstRate })),
      }, { precision: resolved.currency.precision, exchangeRate: resolved.rate, exchangeRateId: resolved.rateId, baseCurrency: resolved.base.code, basePrecision: resolved.base.precision });
      if (bill.total !== computed.total) throw apiError(422, 'TOTALS_MISMATCH', 'Imported bill totals do not match domain totals');
      if (resolved.rateId) await currencyRepository.recordRateUsage(tx, ctx.organisationId, resolved.rateId, 'bill', bill.id);
      await reviewRepo.linkBill(tx, {
        organisationId: ctx.organisationId, documentId: row.id, billId: bill.id, storageKey: row.storageKey,
        filename: row.originalFilename, mimeType: row.mimeType, size: row.sizeBytes,
        issuerName: draft.issuerName, externalNumber: draft.documentNumber,
      });
      recordType = 'bill'; recordId = bill.id;
    }
    await reviewRepo.markCommitted(tx, ctx.organisationId, id, recordType, recordId);
    await repo.insertEvent(tx, { organisationId: ctx.organisationId, documentId: id, actorUserId: ctx.userId, action: 'committed', details: { recordType, recordId, duplicateWarningsAcknowledged: warnings.length > 0 } });
    return invoiceImportCommitResponseSchema.parse({ documentId: id, status: 'committed', recordType, recordId });
  });
}

