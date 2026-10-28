import { createStripePaymentLinkRequestSchema, stripeOnboardingLinkRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../../types';
import { requireSession } from '../auth/require-session';
import { parseIdempotencyKey } from '../invoices/idempotency';
import { isMockStripeGateway } from './stripe.mock-gateway';
import * as repo from './stripe.repository';
import * as service from './stripe.service';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function mockPage(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#172b22;font:16px system-ui,-apple-system,sans-serif}.shell{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(560px,100%);background:white;border:1px solid #dde4df;border-radius:24px;box-shadow:0 24px 70px #173b2920;overflow:hidden}.head{padding:26px 30px;background:#635bff;color:white}.head small{opacity:.85}.head h1{margin:8px 0 0;font-size:27px}.body{padding:30px}.test{display:inline-flex;padding:7px 11px;border-radius:999px;background:#fff3cd;color:#714f00;font-size:13px;font-weight:700}.row{display:flex;justify-content:space-between;gap:18px;padding:14px 0;border-bottom:1px solid #edf0ee}.row strong{text-align:right}.muted{color:#60716a}.total{font-size:22px}.button{width:100%;margin-top:24px;border:0;border-radius:12px;padding:15px 18px;background:#163f2b;color:white;font-size:16px;font-weight:750;cursor:pointer}.secure{text-align:center;font-size:13px;color:#718079;margin:18px 0 0}</style></head><body><main class="shell"><section class="card"><header class="head"><small>LedgerCraft local verification</small><h1>${escapeHtml(title)}</h1></header><div class="body">${body}</div></section></main></body></html>`;
}

function localReturnUrl(candidate: string | undefined, appUrl: string, fallbackPath: string) {
  if (!candidate) return `${appUrl}${fallbackPath}`;
  try { const parsed = new URL(candidate); if (parsed.origin === new URL(appUrl).origin) return parsed.toString(); } catch { /* fall through */ }
  return `${appUrl}${fallbackPath}`;
}

export function stripePublicRoutes() {
  const routes = new Hono<AppEnv>();
  routes.get('/api/stripe/mock/onboarding/:accountId', async (c) => {
    const gateway = c.get('stripeGateway'); const config = c.get('stripeConfig');
    if (!config?.mock || !isMockStripeGateway(gateway)) return c.notFound();
    const accountId = c.req.param('accountId');
    try { await gateway.retrieveConnectedAccount(accountId); } catch { return c.notFound(); }
    const returnUrl = localReturnUrl(c.req.query('return_url'), config.appUrl, '/settings?tab=payments&stripe=return');
    return c.html(mockPage('Stripe onboarding simulator', `<span class="test">TEST MODE · NO REAL STRIPE DATA</span><p class="muted">This local page simulates Stripe-hosted verification and payout setup.</p><div class="row"><span>Business verification</span><strong>Ready to simulate</strong></div><div class="row"><span>NZD payouts</span><strong>Test bank account</strong></div><div class="row"><span>Charges</span><strong>Card payments</strong></div><form method="post" action="/api/stripe/mock/onboarding/${encodeURIComponent(accountId)}?return_url=${encodeURIComponent(returnUrl)}"><button class="button" type="submit">Complete test onboarding</button></form><p class="secure">Local verification only. Production always uses Stripe-hosted onboarding.</p>`));
  });
  routes.post('/api/stripe/mock/onboarding/:accountId', async (c) => {
    const db = c.get('db'); const gateway = c.get('stripeGateway'); const config = c.get('stripeConfig');
    if (!db || !config?.mock || !isMockStripeGateway(gateway)) return c.notFound();
    const accountId = c.req.param('accountId');
    const organisationId = await repo.resolveAccountRoute(db, accountId);
    if (!organisationId) return c.notFound();
    const current = await repo.getConnectedAccount(db, organisationId);
    if (!current) return c.notFound();
    const remote = gateway.completeAccount(accountId);
    await db.transaction((tx) => repo.upsertConnectedAccount(tx, { organisationId, userId: current.userId }, remote));
    return c.redirect(localReturnUrl(c.req.query('return_url'), config.appUrl, '/settings?tab=payments&stripe=return'), 303);
  });
  routes.get('/api/stripe/mock/checkout/:sessionId', (c) => {
    const gateway = c.get('stripeGateway'); const config = c.get('stripeConfig');
    if (!config?.mock || !isMockStripeGateway(gateway)) return c.notFound();
    const checkout = gateway.getCheckout(c.req.param('sessionId'));
    if (!checkout) return c.notFound();
    const money = (cents: number) => `NZD ${(cents / 100).toFixed(2)}`;
    return c.html(mockPage('Stripe Checkout simulator', `<span class="test">TEST CARD · NO REAL CHARGE</span><p class="muted">Invoice ${escapeHtml(checkout.invoiceNumber)}</p><div class="row total"><span>Customer pays</span><strong>${money(checkout.amountCents)}</strong></div><div class="row"><span>LedgerCraft platform margin</span><strong>${money(checkout.platformFeeCents)}</strong></div><div class="row"><span>Organisation receives</span><strong>${money(checkout.amountCents - checkout.platformFeeCents)}</strong></div><p class="muted">Organisation amount is shown before Stripe processing fees.</p><form method="post" action="/api/stripe/mock/checkout/${encodeURIComponent(checkout.id)}/pay"><button class="button" type="submit">Pay with test card • 4242</button></form><p class="secure">The mock emits the same verified Checkout event consumed by LedgerCraft.</p>`));
  });
  routes.post('/api/stripe/mock/checkout/:sessionId/pay', async (c) => {
    const db = c.get('db'); const gateway = c.get('stripeGateway'); const config = c.get('stripeConfig');
    if (!db || !config?.mock || !isMockStripeGateway(gateway)) return c.notFound();
    const checkout = gateway.getCheckout(c.req.param('sessionId'));
    if (!checkout) return c.notFound();
    await service.processVerifiedWebhook(db, gateway.completeCheckout(checkout.id), gateway, config);
    return c.redirect(checkout.successUrl, 303);
  });
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
