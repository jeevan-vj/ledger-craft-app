import {
  invoiceAttachmentSchema,
  invoiceHistorySchema,
  invoiceSchema,
  type InvoiceAttachmentDto,
  type InvoiceDto,
  type InvoiceHistoryDto,
} from '@ledgercraft/contracts';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customers } from '../../db/schema/customers';
import { invoiceAttachments, invoiceHistory, invoices, lineItems } from '../../db/schema/invoices';
import { quotes } from '../../db/schema/quotes';
import { decimal, roundMoney } from './money';
import type { ComputedInvoiceTotals } from './totals';

function toLineDto(row: typeof lineItems.$inferSelect) {
  return {
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    rate: row.rate,
    rateUnit: row.rateUnit,
    tax: row.tax ?? null,
    total: row.total,
    discountType: row.discountType === 'percent' ? 'percent' : 'fixed',
    discountValue: row.discountValue ?? null,
    discountAmount: row.discountAmount,
    taxes: (row.taxes ?? []) as Array<{ id: string; name: string; rate: string }>,
  };
}

function toDto(
  row: typeof invoices.$inferSelect,
  lines: Array<ReturnType<typeof toLineDto>>,
  customerName: string | null,
  sourceQuote?: { id: string; quoteNumber: string },
): InvoiceDto {
  return invoiceSchema.parse({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    externalId: row.externalId ?? null,
    customerId: row.customerId,
    date: row.date,
    dueDate: row.dueDate,
    paymentTermDays: row.paymentTermDays ?? null,
    subtotal: row.subtotal,
    taxAmount: row.taxAmount,
    discountType: row.discountType === 'percent' ? 'percent' : 'fixed',
    discountPercent: row.discountPercent == null ? null : roundMoney(row.discountPercent),
    discount: row.discount == null ? null : roundMoney(row.discount),
    additionalCharges:
      row.additionalCharges == null ? null : roundMoney(row.additionalCharges),
    additionalChargesList: row.additionalChargesList ?? undefined,
    additionalChargesTotal: roundMoney(row.additionalChargesTotal ?? row.additionalCharges ?? 0),
    total: row.total,
    totalPaid: row.totalPaid,
    balanceDue: row.balanceDue,
    paymentStatus: row.paymentStatus,
    taxInclusive: row.taxInclusive,
    status: row.lifecycleStatus === 'cancelled' ? 'cancelled' : row.status,
    notes: row.notes ?? null,
    terms: row.terms ?? null,
    currency: row.currency,
    exchangeRate: row.exchangeRate,
    exchangeRateId: row.exchangeRateId ?? null,
    baseCurrency: row.baseCurrency,
    baseSubtotal: row.baseSubtotal,
    baseTaxAmount: row.baseTaxAmount,
    baseTotal: row.baseTotal,
    customerName,
    items: lines,
    ...(sourceQuote ? { sourceQuoteId: sourceQuote.id, sourceQuoteNumber: sourceQuote.quoteNumber } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  });
}

async function sourceQuotesByInvoice(
  tx: Database,
  organisationId: string,
): Promise<Map<string, { id: string; quoteNumber: string }>> {
  const rows = await tx
    .select({
      invoiceId: quotes.convertedInvoiceId,
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
    })
    .from(quotes)
    .where(and(eq(quotes.organisationId, organisationId), isNotNull(quotes.convertedInvoiceId)));
  const sources = new Map<string, { id: string; quoteNumber: string }>();
  for (const row of rows) {
    if (row.invoiceId) sources.set(row.invoiceId, { id: row.id, quoteNumber: row.quoteNumber });
  }
  return sources;
}

export async function listInvoices(tx: Database, organisationId: string): Promise<InvoiceDto[]> {
  const rows = await tx
    .select({ invoice: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organisationId, organisationId)))
    .where(and(eq(invoices.organisationId, organisationId), isNull(invoices.archivedAt)))
    .orderBy(desc(invoices.date), desc(invoices.createdAt));
  const sources = await sourceQuotesByInvoice(tx, organisationId);

  const result: InvoiceDto[] = [];
  for (const row of rows) {
    const lines = await tx.select().from(lineItems).where(and(eq(lineItems.invoiceId, row.invoice.id), eq(lineItems.organisationId, organisationId)));
    result.push(toDto(row.invoice, lines.map(toLineDto), row.customerName ?? null, sources.get(row.invoice.id)));
  }
  return result;
}

export async function getInvoice(
  tx: Database,
  organisationId: string,
  id: string,
): Promise<InvoiceDto | undefined> {
  const [row] = await tx
    .select({ invoice: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organisationId, organisationId)))
    .where(and(eq(invoices.id, id), eq(invoices.organisationId, organisationId)));
  if (!row) return undefined;
  const lines = await tx.select().from(lineItems).where(and(eq(lineItems.invoiceId, row.invoice.id), eq(lineItems.organisationId, organisationId)));
  const source = await sourceQuoteForInvoice(tx, organisationId, row.invoice.id);
  return toDto(row.invoice, lines.map(toLineDto), row.customerName ?? null, source);
}

async function sourceQuoteForInvoice(
  tx: Database,
  organisationId: string,
  invoiceId: string,
): Promise<{ id: string; quoteNumber: string } | undefined> {
  const [row] = await tx
    .select({ id: quotes.id, quoteNumber: quotes.quoteNumber })
    .from(quotes)
    .where(and(eq(quotes.organisationId, organisationId), eq(quotes.convertedInvoiceId, invoiceId)))
    .limit(1);
  return row;
}

export async function insertInvoice(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: {
    customerId: string;
    invoiceNumber: string;
    externalId?: string | null;
    date: string;
    dueDate: string;
    paymentTermDays: number | null;
    notes: string | null;
    terms: string | null;
    currency: string;
    exchangeRate: string;
    exchangeRateId: string | null;
    baseCurrency: string;
    baseSubtotal: string;
    baseTaxAmount: string;
    baseTotal: string;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    totals: ComputedInvoiceTotals;
  },
): Promise<InvoiceDto> {
  const paid = input.status === 'paid';
  const [row] = await tx
    .insert(invoices)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      invoiceNumber: input.invoiceNumber,
      externalId: input.externalId ?? null,
      customerId: input.customerId,
      date: input.date,
      dueDate: input.dueDate,
      paymentTermDays: input.paymentTermDays,
      subtotal: input.totals.subtotal,
      taxAmount: input.totals.taxAmount,
      discountType: input.totals.discountType,
      discountPercent: input.totals.discountPercent,
      discount: input.totals.discount,
      additionalCharges: input.totals.additionalCharges,
      additionalChargesTotal: input.totals.additionalCharges,
      additionalChargesList: input.totals.additionalChargesList ?? null,
      total: input.totals.total,
      totalPaid: paid ? input.totals.total : '0.00',
      balanceDue: paid ? '0.00' : input.totals.total,
      paymentStatus: paid ? 'paid' : 'unpaid',
      taxInclusive: input.totals.taxInclusive,
      status: input.status,
      notes: input.notes,
      terms: input.terms,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      exchangeRateId: input.exchangeRateId,
      baseCurrency: input.baseCurrency,
      baseSubtotal: input.baseSubtotal,
      baseTaxAmount: input.baseTaxAmount,
      baseTotal: input.baseTotal,
    })
    .returning();
  if (!row) throw new Error('Failed to insert invoice');

  await insertLines(tx, ctx.organisationId, row.id, input.totals);

  return (await getInvoice(tx, ctx.organisationId, row.id))!;
}

export async function replaceInvoiceTotals(
  tx: Database,
  organisationId: string,
  id: string,
  patch: {
    date?: string;
    dueDate?: string;
    paymentTermDays?: number | null;
    notes?: string | null;
    terms?: string | null;
    totals?: ComputedInvoiceTotals;
    currencySnapshot?: { exchangeRate: string; exchangeRateId: string | null; baseCurrency: string; baseSubtotal: string; baseTaxAmount: string; baseTotal: string };
  },
): Promise<InvoiceDto | undefined> {
  const existing = await getInvoice(tx, organisationId, id);
  if (!existing) return undefined;

  const totals = patch.totals;
  const paid = existing.status === 'paid';
  await tx
    .update(invoices)
    .set({
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
      ...(patch.paymentTermDays !== undefined ? { paymentTermDays: patch.paymentTermDays } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.terms !== undefined ? { terms: patch.terms } : {}),
      ...(totals
        ? {
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            discountType: totals.discountType,
            discountPercent: totals.discountPercent,
            discount: totals.discount,
            additionalCharges: totals.additionalCharges,
            additionalChargesTotal: totals.additionalCharges,
            additionalChargesList: totals.additionalChargesList ?? null,
            total: totals.total,
            taxInclusive: totals.taxInclusive,
            totalPaid: paid ? totals.total : existing.totalPaid,
            balanceDue: paid ? '0.00' : totals.total,
          }
        : {}),
      ...(patch.currencySnapshot ?? {}),
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, id), eq(invoices.organisationId, organisationId)));

  if (totals) {
    await tx.delete(lineItems).where(and(eq(lineItems.invoiceId, id), eq(lineItems.organisationId, organisationId)));
    await insertLines(tx, organisationId, id, totals);
  }

  return getInvoice(tx, organisationId, id);
}

async function insertLines(
  tx: Database,
  organisationId: string,
  invoiceId: string,
  totals: ComputedInvoiceTotals,
): Promise<void> {
  for (const line of totals.lines) {
    await tx.insert(lineItems).values({
      organisationId,
      invoiceId,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      rateUnit: line.rateUnit,
      tax: line.tax,
      total: line.total,
      discountType: line.discountType,
      discountValue: line.discountValue,
      discountAmount: line.discountAmount,
      taxes: line.taxes,
    });
  }
}

export async function updateInvoiceStatus(
  tx: Database,
  organisationId: string,
  id: string,
  status: 'draft' | 'sent' | 'paid' | 'overdue',
): Promise<InvoiceDto | undefined> {
  const existing = await getInvoice(tx, organisationId, id);
  if (!existing) return undefined;
  const paid = status === 'paid';
  await tx
    .update(invoices)
    .set({
      status,
      paymentStatus: paid ? 'paid' : existing.paymentStatus === 'paid' ? 'unpaid' : existing.paymentStatus,
      totalPaid: paid ? existing.total : '0.00',
      balanceDue: paid ? '0.00' : existing.total,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, id), eq(invoices.organisationId, organisationId)));
  return getInvoice(tx, organisationId, id);
}

export async function applyPaymentTotals(
  tx: Database,
  organisationId: string,
  invoiceId: string,
  input: {
    totalPaid: string;
    balanceDue: string;
    paymentStatus: string;
    status: string;
  },
): Promise<InvoiceDto | undefined> {
  await tx
    .update(invoices)
    .set({
      totalPaid: input.totalPaid,
      balanceDue: input.balanceDue,
      paymentStatus: input.paymentStatus,
      status: input.status,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organisationId, organisationId)));
  return getInvoice(tx, organisationId, invoiceId);
}

export async function recordHistory(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  invoiceId: string,
  input: {
    action: InvoiceHistoryDto['action'];
    fromStatus?: InvoiceHistoryDto['fromStatus'];
    toStatus?: InvoiceHistoryDto['toStatus'];
    reason?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(invoiceHistory).values({
    organisationId: ctx.organisationId,
    invoiceId,
    actorUserId: ctx.userId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  });
}

export async function listHistory(tx: Database, organisationId: string, invoiceId: string): Promise<InvoiceHistoryDto[]> {
  const rows = await tx.select().from(invoiceHistory).where(and(
    eq(invoiceHistory.organisationId, organisationId), eq(invoiceHistory.invoiceId, invoiceId),
  )).orderBy(desc(invoiceHistory.createdAt));
  return rows.map((row) => invoiceHistorySchema.parse({
    id: row.id, invoiceId: row.invoiceId, action: row.action,
    fromStatus: row.fromStatus, toStatus: row.toStatus, reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function cancelInvoice(tx: Database, organisationId: string, id: string): Promise<InvoiceDto | undefined> {
  const existing = await getInvoice(tx, organisationId, id);
  if (!existing) return undefined;
  if (existing.status === 'cancelled') return existing;
  await tx.update(invoices).set({
    lifecycleStatus: 'cancelled', preCancelStatus: existing.status,
    paymentStatus: 'cancelled', updatedAt: new Date(),
  }).where(and(eq(invoices.organisationId, organisationId), eq(invoices.id, id)));
  return getInvoice(tx, organisationId, id);
}

export async function restoreInvoice(tx: Database, organisationId: string, id: string): Promise<InvoiceDto | undefined> {
  const [row] = await tx.select().from(invoices).where(and(eq(invoices.organisationId, organisationId), eq(invoices.id, id)));
  if (!row) return undefined;
  if (row.lifecycleStatus !== 'cancelled' && row.archivedAt == null) return getInvoice(tx, organisationId, id);
  const status = (row.preCancelStatus ?? row.status) as 'draft' | 'sent' | 'paid' | 'overdue';
  const paymentStatus = status === 'paid' ? 'paid' : decimal(row.totalPaid).compare(0) > 0 ? 'partially_paid' : 'unpaid';
  await tx.update(invoices).set({
    lifecycleStatus: 'active', preCancelStatus: null, archivedAt: null,
    status, paymentStatus, updatedAt: new Date(),
  }).where(and(eq(invoices.organisationId, organisationId), eq(invoices.id, id)));
  return getInvoice(tx, organisationId, id);
}

export async function archiveInvoice(tx: Database, organisationId: string, id: string): Promise<InvoiceDto | undefined> {
  const existing = await getInvoice(tx, organisationId, id);
  if (!existing) return undefined;
  await tx.update(invoices).set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.organisationId, organisationId), eq(invoices.id, id)));
  return getInvoice(tx, organisationId, id);
}

function toAttachmentDto(row: typeof invoiceAttachments.$inferSelect): InvoiceAttachmentDto {
  return invoiceAttachmentSchema.parse({
    id: row.id, invoiceId: row.invoiceId, filename: row.filename,
    contentType: row.contentType, size: row.size, createdAt: row.createdAt.toISOString(),
  });
}

export async function listAttachments(tx: Database, organisationId: string, invoiceId: string): Promise<InvoiceAttachmentDto[]> {
  const rows = await tx.select().from(invoiceAttachments).where(and(
    eq(invoiceAttachments.organisationId, organisationId), eq(invoiceAttachments.invoiceId, invoiceId),
  )).orderBy(desc(invoiceAttachments.createdAt));
  return rows.map(toAttachmentDto);
}

export async function getAttachment(tx: Database, organisationId: string, invoiceId: string, id: string) {
  const [row] = await tx.select().from(invoiceAttachments).where(and(
    eq(invoiceAttachments.organisationId, organisationId), eq(invoiceAttachments.invoiceId, invoiceId), eq(invoiceAttachments.id, id),
  ));
  return row;
}

export async function insertAttachment(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  invoiceId: string,
  input: { objectKey: string; filename: string; contentType: string; size: number },
): Promise<InvoiceAttachmentDto> {
  const [row] = await tx.insert(invoiceAttachments).values({
    organisationId: ctx.organisationId, invoiceId, createdBy: ctx.userId, ...input,
  }).returning();
  if (!row) throw new Error('Failed to attach invoice file');
  return toAttachmentDto(row);
}

export async function deleteAttachment(tx: Database, organisationId: string, invoiceId: string, id: string) {
  const row = await getAttachment(tx, organisationId, invoiceId, id);
  if (!row) return undefined;
  await tx.delete(invoiceAttachments).where(and(eq(invoiceAttachments.organisationId, organisationId), eq(invoiceAttachments.id, id)));
  return row;
}

export async function findByExternalId(tx: Database, organisationId: string, externalId: string): Promise<InvoiceDto | undefined> {
  const [row] = await tx.select({ id: invoices.id }).from(invoices).where(and(
    eq(invoices.organisationId, organisationId), eq(invoices.externalId, externalId),
  ));
  return row ? getInvoice(tx, organisationId, row.id) : undefined;
}

export async function setExternalId(tx: Database, organisationId: string, id: string, externalId: string): Promise<void> {
  await tx.update(invoices).set({ externalId, updatedAt: new Date() }).where(and(
    eq(invoices.organisationId, organisationId), eq(invoices.id, id),
  ));
}
