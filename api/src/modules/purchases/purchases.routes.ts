import {
  createBillRequestSchema,
  createVendorRequestSchema,
  recordBillPaymentRequestSchema,
  updateBillRequestSchema,
  updateVendorRequestSchema,
} from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import * as service from './purchases.service';

export function purchaseRoutes() {
  const routes = new Hono<AppEnv>();
  for (const prefix of ['', '/api'] as const) {
    routes.get(`${prefix}/vendors`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.listVendorsForUser(db, user.id));
    });
    routes.get(`${prefix}/vendors/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.getVendorForUser(db, user.id, c.req.param('id')));
    });
    routes.post(`${prefix}/vendors`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.createVendorForUser(db, user.id, createVendorRequestSchema.parse(await c.req.json())), 201);
    });
    routes.patch(`${prefix}/vendors/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.updateVendorForUser(db, user.id, c.req.param('id'), updateVendorRequestSchema.parse(await c.req.json())));
    });
    routes.delete(`${prefix}/vendors/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await service.deleteVendorForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
    routes.get(`${prefix}/bills`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.listBillsForUser(db, user.id));
    });
    routes.get(`${prefix}/bills/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.getBillForUser(db, user.id, c.req.param('id')));
    });
    routes.post(`${prefix}/bills`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.createBillForUser(db, user.id, createBillRequestSchema.parse(await c.req.json())), 201);
    });
    routes.patch(`${prefix}/bills/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.updateBillForUser(db, user.id, c.req.param('id'), updateBillRequestSchema.parse(await c.req.json())));
    });
    routes.delete(`${prefix}/bills/:id`, async (c) => {
      const { db, user } = await requireSession(c);
      await service.deleteBillForUser(db, user.id, c.req.param('id'));
      return c.body(null, 204);
    });
    routes.post(`${prefix}/bills/:id/receive`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.receiveBillForUser(db, user.id, c.req.param('id')));
    });
    routes.post(`${prefix}/bills/:id/void`, async (c) => {
      const { db, user } = await requireSession(c);
      return c.json(await service.voidBillForUser(db, user.id, c.req.param('id')));
    });
    routes.post(`${prefix}/bills/:id/payments`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = recordBillPaymentRequestSchema.parse(await c.req.json());
      return c.json(await service.recordBillPaymentForUser(db, user.id, c.req.param('id'), input), 201);
    });
  }
  return routes;
}
