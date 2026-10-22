import {
  invoiceSchema,
  type CreateInvoiceAttachmentRequest,
  type ImportInvoicesRequest,
  type ImportInvoicesResponse,
  type InvoiceAttachmentDto,
  type InvoiceDto,
  type InvoiceHistoryDto,
  type InvoiceLifecycleActionRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import { assertKeyOwned } from '../storage/keys';
import type { ObjectStore } from '../storage/object-store';
import { createInvoiceInTx } from './invoices.service';
import { postInvoiceJournal, postInvoiceReversalJournal } from './invoices.journal';
import * as repo from './invoices.repository';
import { assertReplayMatches, getIdempotencyRecord, insertIdempotencyRecord, type IdempotencyScope } from './idempotency';
import { decimal } from './money';

function requireInvoice(invoice: InvoiceDto | undefined): InvoiceDto {
  if (!invoice) throw new HTTPException(404, { message: 'Invoice not found' });
  return invoice;
}

export async function cancelInvoiceForUser(db: Database, userId: string, id: string, input: InvoiceLifecycleActionRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = requireInvoice(await repo.getInvoice(tx, ctx.organisationId, id));
    if (invoice.status === 'cancelled') return invoice;
    if (decimal(invoice.totalPaid).compare(0) > 0) throw apiError(409, 'INVOICE_HAS_PAYMENTS', 'Reverse invoice payments before cancelling');
    await postInvoiceReversalJournal(tx, ctx, {
      invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber,
      date: new Date().toISOString().slice(0, 10), taxAmount: invoice.taxAmount, total: invoice.total,
    });
    const cancelled = requireInvoice(await repo.cancelInvoice(tx, ctx.organisationId, id));
    await repo.recordHistory(tx, ctx, id, { action: 'cancelled', fromStatus: invoice.status, toStatus: 'cancelled', reason: input.reason });
    return cancelled;
  });
}

export async function restoreInvoiceForUser(db: Database, userId: string, id: string, input: InvoiceLifecycleActionRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = requireInvoice(await repo.getInvoice(tx, ctx.organisationId, id));
    const wasCancelled = invoice.status === 'cancelled';
    if (!wasCancelled && !invoice.archivedAt) return invoice;
    const restored = requireInvoice(await repo.restoreInvoice(tx, ctx.organisationId, id));
    if (wasCancelled) await postInvoiceJournal(tx, ctx, {
      invoiceId: restored.id, invoiceNumber: restored.invoiceNumber, date: new Date().toISOString().slice(0, 10),
      subtotal: restored.subtotal, taxAmount: restored.taxAmount, total: restored.total,
    });
    await repo.recordHistory(tx, ctx, id, { action: 'restored', fromStatus: invoice.status, toStatus: restored.status, reason: input.reason });
    return restored;
  });
}

export async function archiveInvoiceForUser(db: Database, userId: string, id: string, input: InvoiceLifecycleActionRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const invoice = requireInvoice(await repo.getInvoice(tx, ctx.organisationId, id));
    if (!['draft', 'cancelled'].includes(invoice.status)) {
      throw apiError(409, 'INVOICE_ARCHIVE_REQUIRES_CANCEL', 'Cancel this invoice before archiving it');
    }
    const archived = requireInvoice(await repo.archiveInvoice(tx, ctx.organisationId, id));
    await repo.recordHistory(tx, ctx, id, { action: 'archived', fromStatus: invoice.status, toStatus: invoice.status, reason: input.reason });
    return archived;
  });
}

export async function duplicateInvoiceForUser(db: Database, userId: string, id: string, idempotency?: IdempotencyScope): Promise<InvoiceDto> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (idempotency) {
      const existing = await getIdempotencyRecord(tx, ctx, idempotency);
      if (existing) {
        assertReplayMatches(existing.requestHash, idempotency.requestHash);
        return invoiceSchema.parse(existing.responseBody);
      }
    }
    const source = requireInvoice(await repo.getInvoice(tx, ctx.organisationId, id));
    const today = new Date().toISOString().slice(0, 10);
    const duplicate = await createInvoiceInTx(tx, ctx, {
      customerId: source.customerId, date: today, dueDate: today,
      notes: source.notes, terms: source.terms, currency: source.currency,
      taxInclusive: source.taxInclusive, discountType: source.discountType,
      discountPercent: source.discountPercent, discount: source.discount,
      additionalCharges: source.additionalCharges,
      additionalChargesList: source.additionalChargesList,
      status: 'draft',
      items: source.items.map((line) => ({
        description: line.description, quantity: line.quantity, unit: line.unit,
        rate: line.rate, rateUnit: line.rateUnit,
        discountType: line.discountType, discountValue: line.discountValue,
        taxes: line.taxes,
      })),
    });
    await repo.recordHistory(tx, ctx, duplicate.id, { action: 'duplicated', fromStatus: null, toStatus: 'draft', metadata: { sourceInvoiceId: source.id } });
    if (idempotency) await insertIdempotencyRecord(tx, ctx, idempotency, { status: 201, body: duplicate });
    return duplicate;
  });
}

export async function listHistoryForUser(db: Database, userId: string, id: string): Promise<{ history: InvoiceHistoryDto[] }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    requireInvoice(await repo.getInvoice(tx, ctx.organisationId, id));
    return { history: await repo.listHistory(tx, ctx.organisationId, id) };
  });
}

export async function listAttachmentsForUser(db: Database, userId: string, id: string): Promise<{ attachments: InvoiceAttachmentDto[] }> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    requireInvoice(await repo.getInvoice(tx, ctx.organisationId, id));
    return { attachments: await repo.listAttachments(tx, ctx.organisationId, id) };
  });
}

export async function attachInvoiceFileForUser(db: Database, userId: string, id: string, store: ObjectStore, input: CreateInvoiceAttachmentRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    requireInvoice(await repo.getInvoice(tx, ctx.organisationId, id));
    assertKeyOwned(input.objectKey, ctx.organisationId);
    const object = await store.get(input.objectKey);
    if (!object || object.bytes.byteLength !== input.size || object.contentType !== input.contentType) {
      throw apiError(400, 'INVALID_ATTACHMENT', 'Uploaded file metadata does not match');
    }
    const attachment = await repo.insertAttachment(tx, ctx, id, input);
    await repo.recordHistory(tx, ctx, id, { action: 'attachment_added', metadata: { attachmentId: attachment.id, filename: attachment.filename } });
    return attachment;
  });
}

export async function deleteInvoiceAttachmentForUser(db: Database, userId: string, invoiceId: string, attachmentId: string, store: ObjectStore) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const removed = await repo.deleteAttachment(tx, ctx.organisationId, invoiceId, attachmentId);
    if (!removed) throw new HTTPException(404, { message: 'Attachment not found' });
    await store.delete(removed.objectKey);
    await repo.recordHistory(tx, ctx, invoiceId, { action: 'attachment_removed', metadata: { attachmentId, filename: removed.filename } });
  });
}

export async function importInvoicesForUser(db: Database, userId: string, input: ImportInvoicesRequest): Promise<ImportInvoicesResponse> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const duplicates: number[] = [];
    for (let index = 0; index < input.rows.length; index += 1) {
      if (await repo.findByExternalId(tx, ctx.organisationId, input.rows[index]!.externalId)) duplicates.push(index + 1);
    }
    if (duplicates.length) return { valid: false, imported: 0, errors: duplicates.map((row) => ({ row, message: 'External id already exists' })) };
    if (input.dryRun) return { valid: true, imported: 0, errors: [] };
    for (const row of input.rows) {
      const created = await createInvoiceInTx(tx, ctx, row);
      await repo.setExternalId(tx, ctx.organisationId, created.id, row.externalId);
      await repo.recordHistory(tx, ctx, created.id, { action: 'imported', fromStatus: null, toStatus: created.status, metadata: { externalId: row.externalId } });
    }
    return { valid: true, imported: input.rows.length, errors: [] };
  });
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function exportInvoicesForUser(db: Database, userId: string): Promise<string> {
  const { invoices } = await import('./invoices.service').then((service) => service.listInvoicesForUser(db, userId));
  const headers = ['externalId', 'invoiceNumber', 'customerId', 'date', 'dueDate', 'currency', 'status', 'subtotal', 'taxAmount', 'total', 'itemsJson'];
  const rows = invoices.map((invoice) => [
    invoice.externalId ?? invoice.id, invoice.invoiceNumber, invoice.customerId, invoice.date, invoice.dueDate,
    invoice.currency, invoice.status, invoice.subtotal, invoice.taxAmount, invoice.total,
    JSON.stringify(invoice.items.map(({ id: _id, ...item }) => item)),
  ].map((value) => csvCell(String(value))).join(','));
  return [headers.join(','), ...rows].join('\n');
}
