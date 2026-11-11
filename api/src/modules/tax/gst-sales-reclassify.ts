import {
  generateGstPeriods,
  salesTaxBoxImpactSchema,
  salesTaxPeriodImpactSchema,
  salesTaxReclassificationLineSchema,
  salesTaxReclassificationListSchema,
  salesTaxReclassificationSchema,
  salesTaxReclassifyPreviewSchema,
  type GstPreparationResponse,
  type SalesTaxBoxImpact,
  type SalesTaxPeriodImpact,
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
import { creditNotes } from '../../db/schema/credit-notes';
import { invoices, lineItems } from '../../db/schema/invoices';
import { payments } from '../../db/schema/payments';
import { salesTaxReclassifications } from '../../db/schema/tax';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';
import { decimal, roundMoney } from '../invoices/money';
import { gstPreparationInTx } from './gst-preparation';
import { gstSettingsInTx } from './gst-settings';
import { assertGstSourceOpen, type GstLockCheck } from './gst-period-lock';

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

function dated(values: Array<string | null>): string[] {
  return values.filter((value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

async function reclassifyLockChecks(tx: Database, organisationId: string, line: LoadedLine): Promise<GstLockCheck[]> {
  const payRows = await tx.select({ paymentDate: payments.paymentDate, reversalDate: payments.reversalDate }).from(payments)
    .where(and(eq(payments.organisationId, organisationId), eq(payments.invoiceId, line.invoiceId)));
  const noteRows = await tx.select({ issueDate: creditNotes.issueDate, reversalDate: creditNotes.reversalDate }).from(creditNotes)
    .where(and(eq(creditNotes.organisationId, organisationId), eq(creditNotes.invoiceId, line.invoiceId)));
  const paymentDates = dated(payRows.flatMap((row) => [row.paymentDate, row.reversalDate]));
  const creditDates = dated(noteRows.flatMap((row) => [row.issueDate, row.reversalDate]));
  return [
    { kind: 'sales_document', dates: [line.date] },
    { kind: 'credit_note', dates: creditDates },
    { kind: 'customer_settlement', dates: paymentDates, cumulativeWith: paymentDates },
  ];
}

async function openForReclassify(tx: Database, organisationId: string, line: LoadedLine): Promise<boolean> {
  try {
    await assertGstSourceOpen(tx, organisationId, await reclassifyLockChecks(tx, organisationId, line));
    return true;
  } catch (error) {
    if (error instanceof HTTPException && error.status === 409) return false;
    throw error;
  }
}

async function assertLinesOpen(tx: Database, organisationId: string, lines: LoadedLine[]) {
  for (const line of lines) await assertGstSourceOpen(tx, organisationId, await reclassifyLockChecks(tx, organisationId, line));
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

async function periodsFor(tx: Database, ctx: Context, lines: LoadedLine[]): Promise<Array<{ from: string; to: string }>> {
  const settings = await gstSettingsInTx(tx, ctx.organisationId);
  const latest = lines.map((line) => line.date).sort().at(-1) ?? settings.gstRegisteredFrom;
  if (!settings.gstRegisteredFrom || !settings.gstFilingFrequency || settings.gstPeriodAnchor == null || !latest) {
    throw apiError(422, 'GST_NOT_REGISTERED', 'Confirm GST registration, frequency and period anchor before reclassifying sales.');
  }
  const generated = generateGstPeriods(settings, latest);
  const matched = new Map<string, { from: string; to: string }>();
  for (const line of lines) {
    const period = generated.find((item) => line.date >= item.periodStart && line.date <= item.periodEnd);
    if (!period) throw apiError(422, 'GST_PERIOD_UNKNOWN', `No GST period covers ${line.date}. Review the registration date and filing frequency.`);
    matched.set(period.periodStart, { from: period.periodStart, to: period.periodEnd });
  }
  return [...matched.values()];
}

async function readPeriods(tx: Database, ctx: Context, periods: Array<{ from: string; to: string }>): Promise<SalesTaxBoxImpact[]> {
  const impacts: SalesTaxBoxImpact[] = [];
  for (const period of periods) impacts.push(impactOf(await gstPreparationInTx(tx, ctx, period)));
  return impacts;
}

function zipPeriods(periods: Array<{ from: string; to: string }>, before: SalesTaxBoxImpact[], after: SalesTaxBoxImpact[]): SalesTaxPeriodImpact[] {
  return periods.map((period, index) => salesTaxPeriodImpactSchema.parse({ ...period, before: before[index], after: after[index] }));
}

class PreviewRolledBack extends Error {
  constructor(readonly periods: SalesTaxPeriodImpact[]) { super('preview rolled back'); }
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
    periods: row.periodImpacts,
    undoneAt: row.undoneAt ? row.undoneAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  });
}

function previewResponse(taxCode: SalesTaxReclassifyPreviewRequest['taxCode'], lineCount: number, periods: SalesTaxPeriodImpact[]): SalesTaxReclassifyPreview {
  return salesTaxReclassifyPreviewSchema.parse({
    taxCode, lineCount, before: periods[0].before, after: periods[0].after, periods,
  });
}

async function previewInTx(tx: Database, ctx: Context, input: SalesTaxReclassifyPreviewRequest): Promise<SalesTaxReclassifyPreview> {
  const lines = await selectedLines(tx, ctx.organisationId, input.lineIds);
  const periods = await periodsFor(tx, ctx, lines);
  const before = await readPeriods(tx, ctx, periods);
  try {
    await tx.transaction(async () => {
      await writeCodes(tx, ctx.organisationId, lines, input.taxCode);
      const after = await readPeriods(tx, ctx, periods);
      throw new PreviewRolledBack(zipPeriods(periods, before, after));
    });
  } catch (error) {
    if (!(error instanceof PreviewRolledBack)) throw error;
    return previewResponse(input.taxCode, lines.length, error.periods);
  }
  throw apiError(500, 'INTERNAL', 'The reclassification preview could not be rolled back.');
}

export async function listSalesTaxReclassificationsForUser(db: Database, userId: string): Promise<SalesTaxReclassificationList> {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    assertOwner(ctx.role);
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
    const periods = await periodsFor(tx, ctx, lines);
    const before = await readPeriods(tx, ctx, periods);
    const previous = Object.fromEntries(lines.map((line) => [line.id, line.taxCode]));
    await writeCodes(tx, ctx.organisationId, lines, input.taxCode);
    const after = await readPeriods(tx, ctx, periods);
    const impacts = zipPeriods(periods, before, after);
    const [row] = await tx.insert(salesTaxReclassifications).values({
      organisationId: ctx.organisationId, actorId: ctx.userId, action: 'apply', taxCode: input.taxCode, reason: input.reason,
      lineIds: lines.map((line) => line.id), previousCodes: previous, beforeImpact: impacts[0].before, afterImpact: impacts[0].after, periodImpacts: impacts,
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
    const periods = await periodsFor(tx, ctx, lines);
    const before = await readPeriods(tx, ctx, periods);
    await restoreCodes(tx, ctx.organisationId, existing.previousCodes);
    const after = await readPeriods(tx, ctx, periods);
    const impacts = zipPeriods(periods, before, after);
    const undoneAt = new Date();
    await tx.update(salesTaxReclassifications).set({ undoneAt }).where(and(
      eq(salesTaxReclassifications.organisationId, ctx.organisationId), eq(salesTaxReclassifications.id, id),
    ));
    const [row] = await tx.insert(salesTaxReclassifications).values({
      organisationId: ctx.organisationId, actorId: ctx.userId, action: 'undo', taxCode: null, reason: input.reason,
      lineIds: existing.lineIds, previousCodes: existing.previousCodes, beforeImpact: impacts[0].before, afterImpact: impacts[0].after,
      periodImpacts: impacts, undoOfId: id,
    }).returning();
    if (!row) throw apiError(500, 'INTERNAL', 'The undo could not be recorded.');
    return toEvent(row);
  });
}
