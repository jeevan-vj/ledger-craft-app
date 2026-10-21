import {
  quoteSchema,
  type QuoteDto,
  type QuoteKind,
  type QuoteStatus,
} from '@ledgercraft/contracts';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customers } from '../../db/schema/customers';
import { invoices } from '../../db/schema/invoices';
import { quoteLineItems, quotes, sharedQuotes } from '../../db/schema/quotes';
import { roundMoney } from '../invoices/money';
import type { ComputedInvoiceTotals } from '../invoices/totals';
import { effectiveStatus } from './quotes.transitions';

function toLineDto(row: typeof quoteLineItems.$inferSelect) {
  return {
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    rate: row.rate,
    rateUnit: row.rateUnit,
    tax: row.tax ?? null,
    total: row.total,
  };
}

function toDto(
  row: typeof quotes.$inferSelect,
  lines: Array<ReturnType<typeof toLineDto>>,
  customerName: string | null,
  convertedInvoiceNumber: string | null,
): QuoteDto {
  return quoteSchema.parse({
    id: row.id,
    quoteNumber: row.quoteNumber,
    kind: row.kind,
    revision: row.revision,
    customerId: row.customerId,
    customerName,
    date: row.date,
    expiryDate: row.expiryDate,
    subtotal: roundMoney(row.subtotal),
    taxAmount: roundMoney(row.taxAmount),
    taxRate: roundMoney(row.taxRate),
    taxInclusive: row.taxInclusive,
    discountType: row.discountType === 'percent' ? 'percent' : 'fixed',
    discountPercent: row.discountPercent == null ? null : roundMoney(row.discountPercent),
    discount: row.discount == null ? null : roundMoney(row.discount),
    additionalCharges: row.additionalCharges == null ? null : roundMoney(row.additionalCharges),
    additionalChargesList: row.additionalChargesList ?? undefined,
    additionalChargesTotal: roundMoney(row.additionalChargesTotal ?? row.additionalCharges ?? 0),
    total: roundMoney(row.total),
    notes: row.notes ?? null,
    terms: row.terms ?? null,
    currency: row.currency,
    templateName: row.templateName ?? null,
    status: row.status,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    publicViewedAt: row.publicViewedAt ? row.publicViewedAt.toISOString() : null,
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
    respondedByName: row.respondedByName ?? null,
    responseNote: row.responseNote ?? null,
    acceptedRevision: row.acceptedRevision ?? null,
    convertedInvoiceId: row.convertedInvoiceId ?? null,
    convertedInvoiceNumber,
    items: lines,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

async function linesFor(tx: Database, organisationId: string, quoteId: string) {
  const rows = await tx
    .select()
    .from(quoteLineItems)
    .where(and(eq(quoteLineItems.quoteId, quoteId), eq(quoteLineItems.organisationId, organisationId)))
    .orderBy(asc(quoteLineItems.sortOrder), asc(quoteLineItems.createdAt));
  return rows.map(toLineDto);
}

async function hydrate(
  tx: Database,
  organisationId: string,
  row: typeof quotes.$inferSelect,
  customerName: string | null,
  convertedInvoiceNumber: string | null,
): Promise<QuoteDto> {
  const lines = await linesFor(tx, organisationId, row.id);
  return toDto(row, lines, customerName, convertedInvoiceNumber);
}

function quoteSelect(tx: Database, organisationId: string) {
  return tx
    .select({
      quote: quotes,
      customerName: customers.name,
      convertedInvoiceNumber: invoices.invoiceNumber,
    })
    .from(quotes)
    .leftJoin(customers, and(eq(customers.id, quotes.customerId), eq(customers.organisationId, organisationId)))
    .leftJoin(invoices, and(eq(invoices.id, quotes.convertedInvoiceId), eq(invoices.organisationId, organisationId)));
}

async function persistExpiry(tx: Database, organisationId: string, quote: QuoteDto, today: string): Promise<QuoteDto> {
  const status = effectiveStatus(quote.status, quote.expiryDate, today);
  if (status === quote.status) return quote;
  await tx
    .update(quotes)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(quotes.id, quote.id), eq(quotes.organisationId, organisationId)));
  return { ...quote, status };
}

export async function listQuotes(tx: Database, organisationId: string, today: string): Promise<QuoteDto[]> {
  const rows = await quoteSelect(tx, organisationId)
    .where(eq(quotes.organisationId, organisationId))
    .orderBy(desc(quotes.date), desc(quotes.createdAt));
  const result: QuoteDto[] = [];
  for (const row of rows) {
    const quote = await hydrate(tx, organisationId, row.quote, row.customerName ?? null, row.convertedInvoiceNumber ?? null);
    result.push(await persistExpiry(tx, organisationId, quote, today));
  }
  return result;
}

export async function getQuote(
  tx: Database,
  organisationId: string,
  id: string,
  today?: string,
): Promise<QuoteDto | undefined> {
  const [row] = await quoteSelect(tx, organisationId).where(and(eq(quotes.id, id), eq(quotes.organisationId, organisationId)));
  if (!row) return undefined;
  const quote = await hydrate(tx, organisationId, row.quote, row.customerName ?? null, row.convertedInvoiceNumber ?? null);
  return today ? persistExpiry(tx, organisationId, quote, today) : quote;
}

export async function insertQuote(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: {
    customerId: string;
    quoteNumber: string;
    kind: QuoteKind;
    revision: number;
    date: string;
    expiryDate: string;
    notes: string | null;
    terms: string | null;
    currency: string;
    templateName: string | null;
    status: QuoteStatus;
    taxRate: string;
    totals: ComputedInvoiceTotals;
  },
): Promise<QuoteDto> {
  const [row] = await tx
    .insert(quotes)
    .values({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      quoteNumber: input.quoteNumber,
      kind: input.kind,
      revision: input.revision,
      customerId: input.customerId,
      date: input.date,
      expiryDate: input.expiryDate,
      subtotal: input.totals.subtotal,
      taxAmount: input.totals.taxAmount,
      taxRate: input.taxRate,
      taxInclusive: input.totals.taxInclusive,
      discountType: input.totals.discountType,
      discountPercent: input.totals.discountPercent,
      discount: input.totals.discount,
      additionalCharges: input.totals.additionalCharges,
      additionalChargesTotal: input.totals.additionalCharges,
      additionalChargesList: input.totals.additionalChargesList ?? null,
      total: input.totals.total,
      notes: input.notes,
      terms: input.terms,
      currency: input.currency,
      templateName: input.templateName,
      status: input.status,
    })
    .returning();
  if (!row) throw new Error('Failed to insert quote');
  await insertLines(tx, ctx.organisationId, row.id, input.totals);
  return (await getQuote(tx, ctx.organisationId, row.id))!;
}

async function insertLines(
  tx: Database,
  organisationId: string,
  quoteId: string,
  totals: ComputedInvoiceTotals,
): Promise<void> {
  for (const [index, line] of totals.lines.entries()) {
    await tx.insert(quoteLineItems).values({
      organisationId,
      quoteId,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      rateUnit: line.rateUnit,
      tax: line.tax,
      total: line.total,
      sortOrder: index,
    });
  }
}

export async function replaceQuote(
  tx: Database,
  organisationId: string,
  id: string,
  patch: {
    customerId?: string;
    kind?: QuoteKind;
    date?: string;
    expiryDate?: string;
    notes?: string | null;
    terms?: string | null;
    currency?: string;
    templateName?: string | null;
    taxRate?: string;
    totals?: ComputedInvoiceTotals;
  },
): Promise<QuoteDto | undefined> {
  const existing = await getQuote(tx, organisationId, id);
  if (!existing) return undefined;
  const totals = patch.totals;
  await tx
    .update(quotes)
    .set({
      ...(patch.customerId !== undefined ? { customerId: patch.customerId } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.date !== undefined ? { date: patch.date } : {}),
      ...(patch.expiryDate !== undefined ? { expiryDate: patch.expiryDate } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.terms !== undefined ? { terms: patch.terms } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.templateName !== undefined ? { templateName: patch.templateName } : {}),
      ...(patch.taxRate !== undefined ? { taxRate: patch.taxRate } : {}),
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
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(quotes.id, id), eq(quotes.organisationId, organisationId), eq(quotes.status, 'draft')));
  if (totals) {
    await tx.delete(quoteLineItems).where(and(eq(quoteLineItems.quoteId, id), eq(quoteLineItems.organisationId, organisationId)));
    await insertLines(tx, organisationId, id, totals);
  }
  return getQuote(tx, organisationId, id);
}

export async function deleteDraftQuote(tx: Database, organisationId: string, id: string): Promise<boolean> {
  const deleted = await tx
    .delete(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.organisationId, organisationId), eq(quotes.status, 'draft')))
    .returning({ id: quotes.id });
  return deleted.length > 0;
}

export async function setQuoteStatus(
  tx: Database,
  organisationId: string,
  id: string,
  patch: {
    status: QuoteStatus;
    sentAt?: Date | null;
    publicViewedAt?: Date | null;
    respondedAt?: Date | null;
    respondedByName?: string | null;
    responseNote?: string | null;
    acceptedRevision?: number | null;
  },
): Promise<QuoteDto | undefined> {
  await tx
    .update(quotes)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(quotes.id, id), eq(quotes.organisationId, organisationId)));
  return getQuote(tx, organisationId, id);
}

export async function reviseQuote(tx: Database, organisationId: string, id: string): Promise<QuoteDto | undefined> {
  await tx
    .update(quotes)
    .set({
      status: 'draft',
      revision: sql`${quotes.revision} + 1`,
      sentAt: null,
      publicViewedAt: null,
      respondedAt: null,
      respondedByName: null,
      responseNote: null,
      acceptedRevision: null,
      updatedAt: new Date(),
    })
    .where(and(eq(quotes.id, id), eq(quotes.organisationId, organisationId)));
  await tx
    .update(sharedQuotes)
    .set({ isActive: false })
    .where(and(eq(sharedQuotes.quoteId, id), eq(sharedQuotes.organisationId, organisationId)));
  return getQuote(tx, organisationId, id);
}

export async function linkConvertedInvoice(
  tx: Database,
  organisationId: string,
  id: string,
  invoiceId: string,
): Promise<QuoteDto | undefined> {
  await tx
    .update(quotes)
    .set({ status: 'converted', convertedInvoiceId: invoiceId, updatedAt: new Date() })
    .where(and(
      eq(quotes.id, id),
      eq(quotes.organisationId, organisationId),
      eq(quotes.status, 'accepted'),
      isNull(quotes.convertedInvoiceId),
    ));
  return getQuote(tx, organisationId, id);
}

export async function insertQuoteShare(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: {
    quoteId: string;
    quote: QuoteDto;
    templateName: string;
    businessProfile: unknown;
    shareToken: string;
    revision: number;
    expiresAt: Date | null;
  },
): Promise<void> {
  await tx.insert(sharedQuotes).values({
    organisationId: ctx.organisationId,
    quoteId: input.quoteId,
    quoteData: input.quote,
    templateData: { templateName: input.templateName, businessProfile: input.businessProfile },
    shareToken: input.shareToken,
    revision: input.revision,
    expiresAt: input.expiresAt,
    createdBy: ctx.userId,
  });
}

export async function findQuoteShare(tx: Database, organisationId: string, shareToken: string) {
  const [row] = await tx
    .select()
    .from(sharedQuotes)
    .where(and(eq(sharedQuotes.organisationId, organisationId), eq(sharedQuotes.shareToken, shareToken)))
    .limit(1);
  return row;
}

export async function incrementQuoteShareAccess(tx: Database, organisationId: string, id: string): Promise<void> {
  await tx
    .update(sharedQuotes)
    .set({ accessCount: sql`${sharedQuotes.accessCount} + 1` })
    .where(and(eq(sharedQuotes.id, id), eq(sharedQuotes.organisationId, organisationId)));
}
