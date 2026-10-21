import {
  invoiceSchema,
  type InvoiceDto,
} from '@ledgercraft/contracts';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { customers } from '../../db/schema/customers';
import { invoices, lineItems } from '../../db/schema/invoices';
import { quotes } from '../../db/schema/quotes';
import { roundMoney } from './money';
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
    customerId: row.customerId,
    date: row.date,
    dueDate: row.dueDate,
    paymentTermDays: row.paymentTermDays ?? null,
    subtotal: roundMoney(row.subtotal),
    taxAmount: roundMoney(row.taxAmount),
    discountType: row.discountType === 'percent' ? 'percent' : 'fixed',
    discountPercent: row.discountPercent == null ? null : roundMoney(row.discountPercent),
    discount: row.discount == null ? null : roundMoney(row.discount),
    additionalCharges:
      row.additionalCharges == null ? null : roundMoney(row.additionalCharges),
    additionalChargesList: row.additionalChargesList ?? undefined,
    additionalChargesTotal: roundMoney(row.additionalChargesTotal ?? row.additionalCharges ?? 0),
    total: roundMoney(row.total),
    totalPaid: roundMoney(row.totalPaid),
    balanceDue: roundMoney(row.balanceDue),
    paymentStatus: row.paymentStatus,
    taxInclusive: row.taxInclusive,
    status: row.status,
    notes: row.notes ?? null,
    terms: row.terms ?? null,
    currency: row.currency,
    customerName,
    items: lines,
    ...(sourceQuote ? { sourceQuoteId: sourceQuote.id, sourceQuoteNumber: sourceQuote.quoteNumber } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
    .where(eq(invoices.organisationId, organisationId))
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
  const sources = await sourceQuotesByInvoice(tx, organisationId);
  return toDto(row.invoice, lines.map(toLineDto), row.customerName ?? null, sources.get(row.invoice.id));
}

export async function insertInvoice(
  tx: Database,
  ctx: { organisationId: string; userId: string },
  input: {
    customerId: string;
    invoiceNumber: string;
    date: string;
    dueDate: string;
    paymentTermDays: number | null;
    notes: string | null;
    terms: string | null;
    currency: string;
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
