import {
  createSavedReportRequestSchema,
  dashboardComparisonSchema,
  dashboardWidgetKindSchema,
  reportFiltersSchema,
  saveDashboardLayoutRequestSchema,
  updateSavedReportRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as service from './dashboard.service';

function filtersFromQuery(query: Record<string, string>) {
  return reportFiltersSchema.parse({ from: query.from, to: query.to, comparison: query.comparison ?? 'previous_period' });
}

export function dashboardRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/dashboard`, async (c) => {
      const { db, user } = await requireSession(c);
      const comparison = c.req.query('comparison');
      return c.json(await service.getDashboardForUser(db, user.id, {
        layoutId: c.req.query('layoutId'),
        from: c.req.query('from'),
        to: c.req.query('to'),
        comparison: comparison ? dashboardComparisonSchema.parse(comparison) : undefined,
      }));
    });
    routes.get(`${prefix}/dashboard-layouts`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.listLayoutsForUser(db, user.id));
    });
    routes.post(`${prefix}/dashboard-layouts`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.createLayoutForUser(db, user.id, saveDashboardLayoutRequestSchema.parse(await c.req.json())), 201);
    });
    routes.put(`${prefix}/dashboard-layouts/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.updateLayoutForUser(db, user.id, c.req.param('id'), saveDashboardLayoutRequestSchema.parse(await c.req.json())));
    });
    routes.delete(`${prefix}/dashboard-layouts/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await service.deleteLayoutForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
    routes.get(`${prefix}/saved-reports`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.listSavedReportsForUser(db, user.id, c.req.query('archived') === 'true'));
    });
    routes.post(`${prefix}/saved-reports`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.createSavedReportForUser(db, user.id, createSavedReportRequestSchema.parse(await c.req.json())), 201);
    });
    routes.patch(`${prefix}/saved-reports/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.updateSavedReportForUser(db, user.id, c.req.param('id'), updateSavedReportRequestSchema.parse(await c.req.json())));
    });
    routes.post(`${prefix}/saved-reports/:id/duplicate`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.duplicateSavedReportForUser(db, user.id, c.req.param('id')), 201);
    });
    routes.delete(`${prefix}/saved-reports/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await service.deleteSavedReportForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
    routes.get(`${prefix}/reports/:type`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.runReportForUser(
        db,
        user.id,
        dashboardWidgetKindSchema.parse(c.req.param('type')),
        filtersFromQuery(c.req.query()),
      ));
    });
  }
  return routes;
}
