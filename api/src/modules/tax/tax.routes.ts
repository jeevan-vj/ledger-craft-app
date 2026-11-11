import {
  createTaxReturnRequestSchema,
  fileTaxReturnRequestSchema,
  reopenGstReturnRequestSchema,
  updateTaxReturnRequestSchema,
  upsertTaxConfigurationRequestSchema,
  gstPreparationQuerySchema,
  gstAdjustmentPreparationRequestSchema,
  companyIncomeTaxPreparationRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as taxService from './tax.service';
import { gstPreparationForUser, reviewedGstPreparationForUser } from './gst-preparation';
import { hashIdempotencyPayload, parseIdempotencyKey } from '../invoices/idempotency';
import { companyIncomeTaxPreparationForUser } from './company-income-tax';
import { gstSettingsRoutes } from './gst-settings';

export function taxRoutes() {
  const routes = new Hono<AppEnv>();
  routes.route('', gstSettingsRoutes());

  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/tax/gst-preparation`, async (c) => {
      const { db, user } = await requireSession(c);
      const period = gstPreparationQuerySchema.parse(c.req.query());
      return c.json(await gstPreparationForUser(db, user.id, period));
    });
    routes.post(`${prefix}/tax/gst-preparation`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = gstAdjustmentPreparationRequestSchema.parse(await c.req.json());
      return c.json(await reviewedGstPreparationForUser(db, user.id, input));
    });
    routes.post(`${prefix}/tax/company-income-tax-preparation`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = companyIncomeTaxPreparationRequestSchema.parse(await c.req.json());
      return c.json(await companyIncomeTaxPreparationForUser(db, user.id, input));
    });
    routes.get(`${prefix}/tax-configurations`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await taxService.getTaxConfigurationForUser(db, user.id, c.req.query('countryCode') ?? 'NZ'));
    });

    routes.put(`${prefix}/tax-configurations`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = upsertTaxConfigurationRequestSchema.parse(await c.req.json());
      return c.json(await taxService.upsertTaxConfigurationForUser(db, user.id, input));
    });

    routes.get(`${prefix}/tax-returns`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await taxService.listTaxReturnsForUser(db, user.id));
    });

    routes.get(`${prefix}/tax-returns/:id/recalculation`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await taxService.recalculateGstReturnForUser(db, user.id, c.req.param('id')));
    });

    routes.get(`${prefix}/tax-returns/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await taxService.getTaxReturnForUser(db, user.id, c.req.param('id')));
    });

    routes.post(`${prefix}/tax-returns`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = createTaxReturnRequestSchema.parse(await c.req.json());
      const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
      const scope = key ? { key, method: 'POST', path: '/api/tax-returns', requestHash: hashIdempotencyPayload(input) } : undefined;
      return c.json(await taxService.createTaxReturnForUser(db, user.id, input, scope), 201);
    });

    routes.patch(`${prefix}/tax-returns/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = updateTaxReturnRequestSchema.parse(await c.req.json());
      return c.json(await taxService.updateTaxReturnForUser(db, user.id, c.req.param('id'), input));
    });

    routes.post(`${prefix}/tax-returns/:id/file`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = fileTaxReturnRequestSchema.parse(await c.req.json());
      return c.json(await taxService.fileTaxReturnForUser(db, user.id, c.req.param('id'), input));
    });

    routes.post(`${prefix}/tax-returns/:id/reopen`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = reopenGstReturnRequestSchema.parse(await c.req.json());
      return c.json(await taxService.reopenGstReturnForUser(db, user.id, c.req.param('id'), input));
    });

    routes.delete(`${prefix}/tax-returns/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await taxService.deleteTaxReturnForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
  }

  return routes;
}
