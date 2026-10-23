import {
  dashboardLayoutSchema,
  savedReportDefinitionSchema,
  type CreateSavedReportRequest,
  type DashboardLayoutDto,
  type SaveDashboardLayoutRequest,
  type SavedReportDefinitionDto,
  type UpdateSavedReportRequest,
} from '@ledgercraft/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { dashboardLayouts, savedReportDefinitions } from '../../db/schema/dashboards';

type Context = { organisationId: string; userId: string };

function layoutDto(row: typeof dashboardLayouts.$inferSelect): DashboardLayoutDto {
  return dashboardLayoutSchema.parse({
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    filters: row.filters,
    widgets: row.widgets,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function reportDto(row: typeof savedReportDefinitions.$inferSelect): SavedReportDefinitionDto {
  return savedReportDefinitionSchema.parse({
    id: row.id,
    name: row.name,
    reportType: row.reportType,
    filters: row.filters,
    isPinned: row.isPinned,
    isArchived: row.isArchived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listLayouts(tx: Database, ctx: Context) {
  const rows = await tx.select().from(dashboardLayouts)
    .where(and(eq(dashboardLayouts.organisationId, ctx.organisationId), eq(dashboardLayouts.userId, ctx.userId)))
    .orderBy(desc(dashboardLayouts.isDefault), asc(dashboardLayouts.name));
  return rows.map(layoutDto);
}

export async function getLayout(tx: Database, ctx: Context, id: string) {
  const [row] = await tx.select().from(dashboardLayouts).where(and(
    eq(dashboardLayouts.organisationId, ctx.organisationId),
    eq(dashboardLayouts.userId, ctx.userId),
    eq(dashboardLayouts.id, id),
  ));
  return row ? layoutDto(row) : undefined;
}

export async function upsertLayout(tx: Database, ctx: Context, input: SaveDashboardLayoutRequest, id?: string) {
  if (input.isDefault) {
    await tx.update(dashboardLayouts).set({ isDefault: false, updatedAt: new Date() }).where(and(
      eq(dashboardLayouts.organisationId, ctx.organisationId),
      eq(dashboardLayouts.userId, ctx.userId),
    ));
  }
  if (id) {
    const [row] = await tx.update(dashboardLayouts).set({
      name: input.name,
      isDefault: input.isDefault,
      filters: input.filters,
      widgets: input.widgets,
      updatedAt: new Date(),
    }).where(and(
      eq(dashboardLayouts.organisationId, ctx.organisationId),
      eq(dashboardLayouts.userId, ctx.userId),
      eq(dashboardLayouts.id, id),
    )).returning();
    return row ? layoutDto(row) : undefined;
  }
  const [row] = await tx.insert(dashboardLayouts).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    name: input.name,
    isDefault: input.isDefault,
    filters: input.filters,
    widgets: input.widgets,
  }).returning();
  return row ? layoutDto(row) : undefined;
}

export async function deleteLayout(tx: Database, ctx: Context, id: string) {
  return (await tx.delete(dashboardLayouts).where(and(
    eq(dashboardLayouts.organisationId, ctx.organisationId),
    eq(dashboardLayouts.userId, ctx.userId),
    eq(dashboardLayouts.id, id),
  )).returning({ id: dashboardLayouts.id })).length > 0;
}

export async function listSavedReports(tx: Database, ctx: Context, includeArchived: boolean) {
  const predicates = [
    eq(savedReportDefinitions.organisationId, ctx.organisationId),
    eq(savedReportDefinitions.userId, ctx.userId),
  ];
  if (!includeArchived) predicates.push(eq(savedReportDefinitions.isArchived, false));
  const rows = await tx.select().from(savedReportDefinitions).where(and(...predicates))
    .orderBy(desc(savedReportDefinitions.isPinned), asc(savedReportDefinitions.name));
  return rows.map(reportDto);
}

export async function getSavedReport(tx: Database, ctx: Context, id: string) {
  const [row] = await tx.select().from(savedReportDefinitions).where(and(
    eq(savedReportDefinitions.organisationId, ctx.organisationId),
    eq(savedReportDefinitions.userId, ctx.userId),
    eq(savedReportDefinitions.id, id),
  ));
  return row ? reportDto(row) : undefined;
}

export async function insertSavedReport(tx: Database, ctx: Context, input: CreateSavedReportRequest) {
  const [row] = await tx.insert(savedReportDefinitions).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    name: input.name,
    reportType: input.reportType,
    filters: input.filters,
    isPinned: input.isPinned,
  }).returning();
  return reportDto(row!);
}

export async function updateSavedReport(tx: Database, ctx: Context, id: string, input: UpdateSavedReportRequest) {
  const patch: Partial<typeof savedReportDefinitions.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.reportType !== undefined) patch.reportType = input.reportType;
  if (input.filters !== undefined) patch.filters = input.filters;
  if (input.isPinned !== undefined) patch.isPinned = input.isPinned;
  if (input.isArchived !== undefined) patch.isArchived = input.isArchived;
  const [row] = await tx.update(savedReportDefinitions).set(patch).where(and(
    eq(savedReportDefinitions.organisationId, ctx.organisationId),
    eq(savedReportDefinitions.userId, ctx.userId),
    eq(savedReportDefinitions.id, id),
  )).returning();
  return row ? reportDto(row) : undefined;
}

export async function deleteSavedReport(tx: Database, ctx: Context, id: string) {
  return (await tx.delete(savedReportDefinitions).where(and(
    eq(savedReportDefinitions.organisationId, ctx.organisationId),
    eq(savedReportDefinitions.userId, ctx.userId),
    eq(savedReportDefinitions.id, id),
  )).returning({ id: savedReportDefinitions.id })).length > 0;
}
