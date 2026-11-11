import {
  salesTaxBoxImpactSchema,
  salesTaxReclassificationLineSchema,
  salesTaxReclassificationListSchema,
  salesTaxReclassificationSchema,
  salesTaxReclassifyPreviewSchema,
  type GstPreparationResponse,
  type SalesTaxBoxImpact,
  type SalesTaxReclassification,
  type SalesTaxReclassificationList,
  type SalesTaxReclassifyPreview,
  type SalesTaxReclassifyPreviewRequest,
  type SalesTaxReclassifyRequest,
  type UndoSalesTaxReclassificationRequest,
} from '@ledgercraft/contracts';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { invoices, lineItems } from '../../db/schema/invoices';
import { salesTaxReclassifications } from '../../db/schema/tax';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { gstPreparationInTx } from './gst-preparation';
import { assertGstSourceOpen, invoiceSettlementDates } from './gst-period-lock';

type Context = { organisationId: string; userId: string; role: string };
type LoadedLine = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  description: string;
  total: string;
  tax: string | null;
  taxCode: string | null;
  status: string;
};

function assertOwner(role: string) {
  if (!['owner', 'admin'].includes(role)) throw apiError(403, 'FORBIDDEN', 'Only an owner or admin can reclassify sales tax codes.');
}

function impactOf(preparation: GstPreparationResponse): SalesTaxBoxImpact {
  const confirmed = preparation.calculation?.mappingStatus === 'supported';
  return salesTaxBoxImpactSchema.parse({
    box5: confirmed ? preparation.calculation?.myIrBoxes['5'] ?? null : null,
    box6: confirmed ? preparation.calculation?.myIrBoxes['6'] ?? null : null,
    unclassifiedSales: roundMoney(preparation.unclassifiedSales ?? '0'),
    zeroRatedSales: roundMoney(preparation.zeroRatedSales ?? '0'),
    exemptSales: roundMoney(preparation.exemptSales ?? '0'),
    mappingStatus: preparation.calculation?.mappingStatus ?? 'requires_confirmation',
    totalSales: preparation.totalSales,
  });
}

async function loadLines(tx: Database, organisationId: string): Promise<LoadedLine[]> {
  const rows = await tx.select({
    id: lineItems.id,
    invoiceId: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    date: invoices.date,
    description: lineItems.description,
    total: lineItems.total,
    tax: lineItems.tax,
    taxCode: lineItems.taxCode,
    status: invoices.status,
  }).from(lineItems).innerJoin(invoices, and(eq(invoices.organisationId, lineItems.organisationId), eq(invoices.id, lineItems.invoiceId)))
    .where(eq(lineItems.organisationId, organisationId));
  return rows;
}

function unclassified(line: LoadedLine): boolean {
  return line.status !== 'draft' && (line.taxCode == null || line.taxCode === 'unclassified') && decimal(line.tax ?? '0').compare(0) === 0;
}

async function openForReclassify(tx: Database, organisationId: string, line: LoadedLine): Promise<boolean> {
  const settlements = await invoiceSettlementDates(tx, organisationId, line.invoiceId);
  try {
    await assertGstSourceOpen(tx, organisationId, [
      { kind: 'sales_document', dates: [line.date] },
      { kind: 'customer_settlement', dates: settlements, cumulativeWith: settlements },
    ]);
    return true;
  } catch (error) {
    if (error instanceof HTTPException && error.status === 409) return false;
    throw error;
  }
}

async function assertLinesOpen(tx: Database, organisationId: string, lines: LoadedLine[]) {
  for (const line of lines) {
    const settlements = await invoiceSettlementDates(tx, organisationId, line.invoiceId);
    await assertGstSourceOpen(tx, organisationId, [
      { kind: 'sales_document', dates: [line.date] },
      { kind: 'customer_settlement', dates: settlements, cumulativeWith: settlements },
    ]);
  }
}

async function selectedLines(tx: Database, organisationId: string, lineIds: string[]): Promise<LoadedLine[]> {
  if (new Set(lineIds).size !== lineIds.length) throw apiError(400, 'VALIDATION_ERROR', 'Choose each sales line once.');
  const rows = await loadLines(tx, organisationId);
  const byId = new Map(rows.map((line) => [line.id, line]));
  const chosen = lineIds.map((id) => byId.get(id));
  if (chosen.some((line) => !line)) throw apiError(404, 'NOT_FOUND', 'One of those sales lines is not in this business.');
  const lines = chosen as LoadedLine[];
  if (lines.some((line) => !unclassified(line))) throw apiError(409, 'SALES_TAX_ALREADY_CLASSIFIED', 'Only unclassified 0% sales lines in an open period can be reclassified.');
  await assertLinesOpen(tx, organisationId, lines);
  return lines;
}

async function preparationFor(tx: Database, ctx: Context, lines: LoadedLine[]): Promise<GstPreparationResponse> {
  const dates = lines.map((line) => line.date).sort();
  return gstPreparationInTx(tx, ctx, { from: dates[0], to: dates[dates.length - 1] });
}

async function writeCodes(tx: Database, organisationId: string, lines: LoadedLine[], taxCode: string | null) {
  if (!lines.length) return;
  await tx.update(lineItems).set({ taxCode, updatedAt: new Date() }).where(and(
    eq(lineItems.organisationId, organisationId),
    inArray(lineItems.id, lines.map((line) => line.id)),
  ));
}

async function restoreCodes(tx: Database, organisationId: string, previous: Record<string, string | null>) {
  for (const [id, taxCode] of Object.entries(previous)) {
    await tx.update(lineItems).set({ taxCode, updatedAt: new Date() }).where(and(eq(lineItems.organisationId, organisationId), eq(lineItems.id, id)));
  }
}

function toEvent(row: typeof salesTaxReclassifications.$inferSelect): SalesTaxReclassification {
  return salesTaxReclassificationSchema.parse({
    id: row.id,
    action: row.action,
    taxCode: row.taxCode,
    reason: row.reason,
    lineIds: row.lineIds,
    before: row.beforeImpact,
    after: row.afterImpact,
    undoneAt: row.undoneAt ? row.undoneAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  });
}

async function previewInTx(tx: Database, ctx: Context, input: SalesTaxReclassifyPreviewRequest): Promise<SalesTaxReclassifyPreview> {
  const lines = await selectedLines(tx, ctx.organisationId, input.lineIds);
  const before = impactOf(await preparationFor(tx, ctx, lines));
  const previous = Object.fromEntries(lines.map((line) => [line.id, line.taxCode]));
  await writeCodes(tx, ctx.organisationId, lines, input.taxCode);
  const after = impactOf(await preparationFor(tx, ctx, lines));
  await restoreCodes(tx, ctx.organisationId, previous);
  return salesTaxReclassifyPreviewSchema.parse({ taxCode: input.taxCode, lineCount: lines.length, before, after });
}

export async function listSalesTaxReclassificationsForUser(db: Database, userId: string): Promise<SalesTaxReclassificationList> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const rows = await loadLines(tx, ctx.organisationId);
    const open: SalesTaxReclassificationList['lines'] = [];
    for (const line of rows.filter(unclassified)) {
      if (!await openForReclassify(tx, ctx.organisationId, line)) continue;
      open.push(salesTaxReclassificationLineSchema.parse({
        id: line.id, invoiceId: line.invoiceId, invoiceNumber: line.invoiceNumber, date: line.date,
        description: line.description, total: roundMoney(line.total), taxCode: null,
      }));
    }
    const events = await tx.select().from(salesTaxReclassifications)
      .where(eq(salesTaxReclassifications.organisationId, ctx.organisationId))
      .orderBy(desc(salesTaxReclassifications.createdAt)).limit(50);
    return salesTaxReclassificationListSchema.parse({ lines: open, events: events.map(toEvent) });
  });
}

export async function previewSalesTaxReclassificationForUser(db: Database, userId: string, input: SalesTaxReclassifyPreviewRequest): Promise<SalesTaxReclassifyPreview> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    assertOwner(ctx.role);
    return previewInTx(tx, ctx, input);
  });
}

export async function applySalesTaxReclassificationForUser(db: Database, userId: string, input: SalesTaxReclassifyRequest): Promise<SalesTaxReclassification> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    assertOwner(ctx.role);
    const lines = await selectedLines(tx, ctx.organisationId, input.lineIds);
    const before = impactOf(await preparationFor(tx, ctx, lines));
    const previous = Object.fromEntries(lines.map((line) => [line.id, line.taxCode]));
    await writeCodes(tx, ctx.organisationId, lines, input.taxCode);
    const after = impactOf(await preparationFor(tx, ctx, lines));
    const [row] = await tx.insert(salesTaxReclassifications).values({
      organisationId: ctx.organisationId, actorId: ctx.userId, action: 'apply', taxCode: input.taxCode, reason: input.reason,
      lineIds: lines.map((line) => line.id), previousCodes: previous, beforeImpact: before, afterImpact: after,
    }).returning();
    if (!row) throw apiError(500, 'INTERNAL', 'The reclassification could not be recorded.');
    return toEvent(row);
  });
}

export async function undoSalesTaxReclassificationForUser(db: Database, userId: string, id: string, input: UndoSalesTaxReclassificationRequest): Promise<SalesTaxReclassification> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    assertOwner(ctx.role);
    const [existing] = await tx.select().from(salesTaxReclassifications).where(and(
      eq(salesTaxReclassifications.organisationId, ctx.organisationId), eq(salesTaxReclassifications.id, id),
    ));
    if (!existing || existing.action !== 'apply') throw apiError(404, 'NOT_FOUND', 'That reclassification is not in this business.');
    if (existing.undoneAt) throw apiError(409, 'SALES_TAX_RECLASSIFICATION_UNDONE', 'That reclassification has already been undone.');
    const current = await loadLines(tx, ctx.organisationId);
    const byId = new Map(current.map((line) => [line.id, line]));
    const targets = existing.lineIds.map((lineId) => byId.get(lineId));
    if (targets.some((line) => !line)) throw apiError(409, 'SALES_TAX_RECLASSIFICATION_STALE', 'A reclassified line is no longer on its invoice.');
    const lines = targets as LoadedLine[];
    if (lines.some((line) => line.taxCode !== existing.taxCode)) throw apiError(409, 'SALES_TAX_RECLASSIFICATION_STALE', 'A line has changed since this reclassification. Review it before undoing.');
    await assertLinesOpen(tx, ctx.organisationId, lines);
    const before = impactOf(await preparationFor(tx, ctx, lines));
    await restoreCodes(tx, ctx.organisationId, existing.previousCodes);
    const after = impactOf(await preparationFor(tx, ctx, lines));
    const undoneAt = new Date();
    await tx.update(salesTaxReclassifications).set({ undoneAt }).where(and(
      eq(salesTaxReclassifications.organisationId, ctx.organisationId), eq(salesTaxReclassifications.id, id),
    ));
    const [row] = await tx.insert(salesTaxReclassifications).values({
      organisationId: ctx.organisationId, actorId: ctx.userId, action: 'undo', taxCode: null, reason: input.reason,
      lineIds: existing.lineIds, previousCodes: existing.previousCodes, beforeImpact: before, afterImpact: after, undoOfId: id,
    }).returning();
    if (!row) throw apiError(500, 'INTERNAL', 'The undo could not be recorded.');
    return toEvent(row);
  });
}
