import { invoiceSchema, stripePaymentLinkSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { withTestDb } from '../../test/harness';
import type { StripeGateway, StripeWebhookEvent } from './stripe.gateway';

const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const cookieOf = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');

function gateway(events: Map<string, StripeWebhookEvent>, checkouts: { count: number }): StripeGateway {
  const sessions = new Map<string, import('./stripe.gateway').CreateCheckoutSessionInput>();
  return {
    async createConnectedAccount() {
      return { id: 'acct_gst_gate', chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [], disabledReason: null };
    },
    async retrieveConnectedAccount() {
      return { id: 'acct_gst_gate', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: [], disabledReason: null };
    },
    async createAccountLink() {
      return { url: 'https://connect.stripe.com/setup/s/gst', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    },
    async createCheckoutSession(input) {
      checkouts.count += 1;
      sessions.set(`cs_${input.paymentLinkId}`, input);
      return { id: `cs_${input.paymentLinkId}`, url: `https://checkout.stripe.com/c/pay/${input.paymentLinkId}`, expiresAt: Math.floor(Date.now() / 1000) + 86_400 };
    },
    async retrieveCheckoutPayment(id) {
      const input = sessions.get(id)!;
      return { id: 'pi_gst_captured', sessionId: id, status: 'succeeded', currency: 'nzd', amountCents: input.amountCents, refundedCents: 0, platformFeeCents: input.platformFeeCents, applicationFeeRefundedCents: 0, destinationAccountId: input.connectedAccountId, organisationId: input.organisationId, paymentLinkId: input.paymentLinkId };
    },
    async expireCheckoutSession() {},
    async constructWebhookEvent(payload, signature) {
      if (signature !== 'test_signature') throw new Error('Invalid signature');
      const event = events.get(new TextDecoder().decode(payload));
      if (!event) throw new Error('Unknown event');
      return event;
    },
  };
}

describe('Stripe checkout and captured drafts without GST filing settings', () => {
  it('does not open Checkout for a draft tax invoice until filing settings are saved, and still opens it for an already sent invoice', async () => withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const checkouts = { count: 0 };
      const approvedOrganisationIds: string[] = [];
      const app = createApp({
        auth: createAuth(db), db, stripeGateway: gateway(new Map(), checkouts),
        stripeConfig: { enabled: true, mode: 'test', approvedOrganisationIds, appUrl: 'http://localhost:8080', platformFeeBasisPoints: 400, platformFeeFixedCents: 30, webhookSecret: 'whsec_test', connectWebhookSecret: 'whsec_connect_test' },
      });
      const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Stripe GST', email: `gst-stripe-${crypto.randomUUID()}@example.test`, password: 'password123' }) });
      const cookie = cookieOf(signup);
      const auth = { ...headers, Cookie: cookie };
      await app.request('/api/business-profile', { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Kauri Studio Ltd', email: 'hello@kauristudio.nz', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01' }) });
      const customer = await app.request('/api/customers', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Buyer', email: 'buyer@example.test' }) });
      const customerId = ((await customer.json()) as { id: string }).id;
      const draft = invoiceSchema.parse(await (await app.request('/api/invoices', { method: 'POST', headers: auth, body: JSON.stringify({ customerId, date: '2026-10-15', dueDate: '2026-11-15', currency: 'NZD', taxInclusive: true, taxRate: '15', items: [{ description: 'Services', quantity: '1', rate: '115.00' }] }) })).json());
      await app.request('/api/payments/stripe/account', { method: 'POST', headers: { ...auth, 'Idempotency-Key': 'acct' }, body: '{}' });
      await app.request('/api/payments/stripe/account/refresh', { method: 'POST', headers: auth, body: '{}' });
      approvedOrganisationIds.push(String((await sql.unsafe('SELECT organisation_id FROM stripe_connected_accounts'))[0].organisation_id));
      const blocked = await app.request(`/api/invoices/${draft.id}/payment-links`, { method: 'POST', headers: { ...auth, 'Idempotency-Key': 'draft-link' }, body: JSON.stringify({ amount: '115.00' }) });
      expect(blocked.status).toBe(422);
      expect(await blocked.json()).toMatchObject({ error: { code: 'GST_FILING_SETTINGS_REQUIRED' } });
      expect(checkouts.count).toBe(0);

      await app.request('/api/business-profile', { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Kauri Studio Ltd', email: 'hello@kauristudio.nz', gstRegistrationStatus: 'unknown' }) });
      await app.request(`/api/invoices/${draft.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'sent' }) });
      await app.request('/api/business-profile', { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Kauri Studio Ltd', email: 'hello@kauristudio.nz', country: 'NZ', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01' }) });
      const opened = await app.request(`/api/invoices/${draft.id}/payment-links`, { method: 'POST', headers: { ...auth, 'Idempotency-Key': 'sent-link' }, body: JSON.stringify({ amount: '115.00' }) });
      expect(opened.status).toBe(201);
      expect(stripePaymentLinkSchema.parse(await opened.json()).status).toBe('open');
      expect(checkouts.count).toBe(1);
    } finally { await sql.end(); }
  }));

  it('records a captured Checkout charge for review and completes the event when filing settings are missing', async () => withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const events = new Map<string, StripeWebhookEvent>();
      const approvedOrganisationIds: string[] = [];
      const app = createApp({
        auth: createAuth(db), db, stripeGateway: gateway(events, { count: 0 }),
        stripeConfig: { enabled: true, mode: 'test', approvedOrganisationIds, appUrl: 'http://localhost:8080', platformFeeBasisPoints: 400, platformFeeFixedCents: 30, webhookSecret: 'whsec_test', connectWebhookSecret: 'whsec_connect_test' },
      });
      const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Stripe Capture', email: `gst-capture-${crypto.randomUUID()}@example.test`, password: 'password123' }) });
      const cookie = cookieOf(signup);
      const auth = { ...headers, Cookie: cookie };
      await app.request('/api/business-profile', { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Kauri Studio Ltd', email: 'hello@kauristudio.nz', country: 'NZ', defaultTaxRate: '15' }) });
      const customer = await app.request('/api/customers', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Buyer', email: 'buyer@example.test' }) });
      const customerId = ((await customer.json()) as { id: string }).id;
      const draft = invoiceSchema.parse(await (await app.request('/api/invoices', { method: 'POST', headers: auth, body: JSON.stringify({ customerId, date: '2026-10-15', dueDate: '2026-11-15', currency: 'NZD', taxInclusive: true, taxRate: '15', items: [{ description: 'Services', quantity: '1', rate: '115.00' }] }) })).json());
      await app.request('/api/payments/stripe/account', { method: 'POST', headers: { ...auth, 'Idempotency-Key': 'acct' }, body: '{}' });
      await app.request('/api/payments/stripe/account/refresh', { method: 'POST', headers: auth, body: '{}' });
      approvedOrganisationIds.push(String((await sql.unsafe('SELECT organisation_id FROM stripe_connected_accounts'))[0].organisation_id));
      const link = stripePaymentLinkSchema.parse(await (await app.request(`/api/invoices/${draft.id}/payment-links`, { method: 'POST', headers: { ...auth, 'Idempotency-Key': 'open-link' }, body: JSON.stringify({ amount: '115.00' }) })).json());
      await app.request('/api/business-profile', { method: 'PUT', headers: auth, body: JSON.stringify({ name: 'Kauri Studio Ltd', email: 'hello@kauristudio.nz', country: 'NZ', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01' }) });
      events.set('captured', {
        id: 'evt_gst_captured', type: 'checkout.session.completed', livemode: false, account: null,
        data: { object: { id: `cs_${link.id}` } },
      });
      const webhook = await app.request('/api/stripe/webhooks/platform', { method: 'POST', headers: { 'stripe-signature': 'test_signature', 'content-type': 'text/plain' }, body: 'captured' });
      expect(webhook.status, await webhook.clone().text()).toBe(200);
      expect(invoiceSchema.parse(await (await app.request(`/api/invoices/${draft.id}`, { headers: { Cookie: cookie } })).json()).status).toBe('draft');
      expect(await sql.unsafe('SELECT id FROM payments WHERE invoice_id = ?', [draft.id])).toHaveLength(0);
      expect(await sql.unsafe("SELECT outcome FROM stripe_events WHERE event_id = 'evt_gst_captured'")).toMatchObject([{ outcome: 'processed' }]);
      const review = await sql.unsafe("SELECT result, differences FROM stripe_verifications WHERE kind = 'captured_payment'");
      expect(review).toHaveLength(1);
      expect(JSON.stringify(review[0])).toContain('review_required');
      expect(JSON.stringify(review[0])).toContain('gst_filing_settings_required');
    } finally { await sql.end(); }
  }));
});
