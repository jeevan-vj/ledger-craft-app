import {
  dashboardLayoutListResponseSchema,
  dashboardResponseSchema,
  dashboardWidgetKindSchema,
  reportFiltersSchema,
  savedReportListResponseSchema,
  type CreateSavedReportRequest,
  type DashboardWidgetKind,
  type ReportFilters,
  type SaveDashboardLayoutRequest,
  type UpdateSavedReportRequest,
} from '@ledgercraft/contracts';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client';
import { withOrganisationTx } from '../auth/bind-organisation';
import * as repo from './dashboard.repository';
import { buildReport, buildReports } from './dashboard.reports';

const widgetKinds = dashboardWidgetKindSchema.options;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yearStart() {
  return `${today().slice(0, 4)}-01-01`;
}

function defaultInput(): SaveDashboardLayoutRequest {
  return {
    name: 'My dashboard',
    isDefault: true,
    filters: { from: yearStart(), to: today(), comparison: 'previous_period' },
    widgets: widgetKinds.map((kind, order) => ({
      kind,
      order,
      visible: true,
      size: kind === 'summary' || kind === 'activity' ? 'large' : 'medium',
    })),
  };
}

export async function getDashboardForUser(db: Database, userId: string, requested: Partial<ReportFilters> & { layoutId?: string }) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const layouts = await repo.listLayouts(tx, ctx);
    let layout = requested.layoutId
      ? await repo.getLayout(tx, ctx, requested.layoutId)
      : layouts.find((candidate) => candidate.isDefault) ?? layouts[0];
    if (requested.layoutId && !layout) throw new HTTPException(404, { message: 'Dashboard layout not found' });
    layout ??= await repo.upsertLayout(tx, ctx, defaultInput());
    if (!layout) throw new Error('Failed to create default dashboard');
    const filters = reportFiltersSchema.parse({
      from: requested.from ?? layout.filters.from,
      to: requested.to ?? layout.filters.to,
      comparison: requested.comparison ?? layout.filters.comparison,
    });
    const reports = await buildReports(tx, ctx.organisationId, filters);
    return dashboardResponseSchema.parse({ layout: { ...layout, filters }, reports });
  });
}

export async function listLayoutsForUser(db: Database, userId: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    dashboardLayoutListResponseSchema.parse({ layouts: await repo.listLayouts(tx, ctx) }));
}

export async function createLayoutForUser(db: Database, userId: string, input: SaveDashboardLayoutRequest) {
  return withOrganisationTx(db, userId, (tx, ctx) => repo.upsertLayout(tx, ctx, input));
}

export async function updateLayoutForUser(db: Database, userId: string, id: string, input: SaveDashboardLayoutRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const updated = await repo.upsertLayout(tx, ctx, input, id);
    if (!updated) throw new HTTPException(404, { message: 'Dashboard layout not found' });
    return updated;
  });
}

export async function deleteLayoutForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const layout = await repo.getLayout(tx, ctx, id);
    if (!layout) throw new HTTPException(404, { message: 'Dashboard layout not found' });
    if (layout.isDefault) throw new HTTPException(409, { message: 'Choose another default dashboard before deleting this one' });
    await repo.deleteLayout(tx, ctx, id);
  });
}

export async function listSavedReportsForUser(db: Database, userId: string, includeArchived: boolean) {
  return withOrganisationTx(db, userId, async (tx, ctx) =>
    savedReportListResponseSchema.parse({ reports: await repo.listSavedReports(tx, ctx, includeArchived) }));
}

export async function createSavedReportForUser(db: Database, userId: string, input: CreateSavedReportRequest) {
  return withOrganisationTx(db, userId, (tx, ctx) => repo.insertSavedReport(tx, ctx, input));
}

export async function updateSavedReportForUser(db: Database, userId: string, id: string, input: UpdateSavedReportRequest) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const updated = await repo.updateSavedReport(tx, ctx, id, input);
    if (!updated) throw new HTTPException(404, { message: 'Saved report not found' });
    return updated;
  });
}

export async function duplicateSavedReportForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    const existing = await repo.getSavedReport(tx, ctx, id);
    if (!existing) throw new HTTPException(404, { message: 'Saved report not found' });
    return repo.insertSavedReport(tx, ctx, {
      name: `${existing.name} copy`,
      reportType: existing.reportType,
      filters: existing.filters,
      isPinned: false,
    });
  });
}

export async function deleteSavedReportForUser(db: Database, userId: string, id: string) {
  return withOrganisationTx(db, userId, async (tx, ctx) => {
    if (!(await repo.deleteSavedReport(tx, ctx, id))) throw new HTTPException(404, { message: 'Saved report not found' });
  });
}

export async function runReportForUser(db: Database, userId: string, type: DashboardWidgetKind, filters: ReportFilters) {
  return withOrganisationTx(db, userId, (tx, ctx) => buildReport(tx, ctx.organisationId, type, filters));
}
