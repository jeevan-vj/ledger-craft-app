import { createStripePaymentLinkRequestSchema, stripeOnboardingLinkRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { parseIdempotencyKey } from '../invoices/idempotency';
import * as service from './stripe.service';

export function stripePublicRoutes() {
  const routes = new Hono<AppEnv>();
  routes.get('/api/public/pay/:token', async (c) => {
    const db = c.get('db');
    if (!db) throw new HTTPException(503, { message: 'Database unavailable' });
    return service.publicPaymentRedirect(db, c.req.param('token'));
  });
  for (const kind of ['platform', 'connect'] as const) {
    routes.post(`/api/stripe/webhooks/${kind}`, async (c) => {
      const db = c.get('db');
      if (!db) throw new HTTPException(503, { message: 'Database unavailable' });
      const signature = c.req.header('stripe-signature');
      if (!signature) throw new HTTPException(400, { message: 'Missing Stripe signature' });
      return c.json(await service.resolveWebhookEvent(
        db, new Uint8Array(await c.req.arrayBuffer()), signature, kind,
        c.get('stripeGateway'), c.get('stripeConfig'),
      ));
    });
  }
  return routes;
}

export function stripeRoutes() {
  const routes = new Hono<AppEnv>();
  routes.get('/api/payments/stripe/account', async (c) => {
    const { db, user } = await requireSession(c);
    return c.json(await service.getAccount(db, user.id));
  });
  routes.post('/api/payments/stripe/account', async (c) => {
    const { db, user } = await requireSession(c);
    const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
    if (!key) throw new HTTPException(400, { message: 'Idempotency-Key is required' });
    return c.json(await service.createAccount(db, user.id, c.get('stripeGateway'), c.get('stripeConfig'), key), 201);
  });
  routes.post('/api/payments/stripe/account/refresh', async (c) => {
    const { db, user } = await requireSession(c);
    return c.json(await service.refreshAccount(db, user.id, c.get('stripeGateway'), c.get('stripeConfig')));
  });
  routes.post('/api/payments/stripe/account/onboarding-link', async (c) => {
    const { db, user } = await requireSession(c);
    stripeOnboardingLinkRequestSchema.parse(await c.req.json());
    return c.json(await service.createOnboardingLink(db, user.id, c.get('stripeGateway'), c.get('stripeConfig')));
  });
  routes.post('/api/invoices/:id/payment-links', async (c) => {
    const { db, user } = await requireSession(c);
    const key = parseIdempotencyKey(c.req.header('Idempotency-Key'));
    if (!key) throw new HTTPException(400, { message: 'Idempotency-Key is required' });
    const input = createStripePaymentLinkRequestSchema.parse(await c.req.json());
    return c.json(await service.createPaymentLink(db, user.id, c.req.param('id'), input, c.get('stripeGateway'), c.get('stripeConfig'), key), 201);
  });
  routes.get('/api/invoices/:id/payment-links', async (c) => {
    const { db, user } = await requireSession(c);
    return c.json(await service.listPaymentLinks(db, user.id, c.req.param('id'), c.get('stripeConfig')?.appUrl ?? new URL(c.req.url).origin));
  });
  routes.get('/api/invoices/:id/payment-links/:linkId', async (c) => {
    const { db, user } = await requireSession(c);
    return c.json(await service.getPaymentLink(db, user.id, c.req.param('id'), c.req.param('linkId'), c.get('stripeConfig')?.appUrl ?? new URL(c.req.url).origin));
  });
  routes.post('/api/invoices/:id/payment-links/:linkId/cancel', async (c) => {
    const { db, user } = await requireSession(c);
    return c.json(await service.cancelPaymentLink(db, user.id, c.req.param('id'), c.req.param('linkId'), c.get('stripeGateway'), c.get('stripeConfig')));
  });
  return routes;
}
