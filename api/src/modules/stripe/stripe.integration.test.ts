import {
  invoiceSchema,
  paymentReceiptSchema,
  stripeAccountStatusSchema,
  stripeOnboardingLinkSchema,
  stripePaymentLinkSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import type { StripeGateway, StripeWebhookEvent } from './stripe.gateway';

const originHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

async function signUp(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST', headers: originHeaders,
    body: JSON.stringify({ name: 'Stripe Owner', email: `stripe-${crypto.randomUUID()}@example.com`, password: 'password123' }),
  });
  expect(response.status).toBe(200);
  return cookieHeader(response);
}

async function seedInvoice(app: ReturnType<typeof createApp>, cookie: string) {
  await app.request('/api/business-profile', {
    method: 'PUT', headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'Kauri Studio Ltd', email: 'hello@kauristudio.nz', country: 'NZ', defaultTaxRate: '15', invoiceNumberFormat: 'INV-{YYYY}-{SEQ}', invoiceNumberSequence: 0 }),
  });
  const customer = await app.request('/api/customers', {
    method: 'POST', headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'North Harbour Cafe', email: 'hello@nhcafe.nz', country: 'NZ' }),
  });
  const customerId = ((await customer.json()) as { id: string }).id;
  const response = await app.request('/api/invoices', {
    method: 'POST', headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ customerId, date: '2026-10-29', dueDate: '2026-11-29', taxInclusive: false, taxRate: '15', items: [{ description: 'Brand identity', quantity: '1', rate: '100' }] }),
  });
  return invoiceSchema.parse(await response.json());
}

function testGateway(events: Map<string, StripeWebhookEvent>): StripeGateway {
  return {
    async createConnectedAccount() {
      return { id: 'acct_test_easybiz', chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: ['business_profile.url'], disabledReason: null };
    },
    async retrieveConnectedAccount() {
      return { id: 'acct_test_easybiz', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: [], disabledReason: null };
    },
    async createAccountLink() {
      return { url: 'https://connect.stripe.com/setup/s/test_link', expiresAt: Math.floor(Date.now() / 1000) + 3_600 };
    },
    async createCheckoutSession(input) {
      return {
        id: `cs_test_${input.paymentLinkId}`,
        url: `https://checkout.stripe.com/c/pay/${input.paymentLinkId}`,
        expiresAt: Math.floor(Date.now() / 1000) + 86_400,
      };
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

describe('Stripe Connect payment links', () => {
  it('onboards an organisation and settles an invoice once per verified webhook', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const events = new Map<string, StripeWebhookEvent>();
        const app = createApp({
          auth: createAuth(db), db, stripeGateway: testGateway(events),
          stripeConfig: { enabled: true, mode: 'test', appUrl: 'http://localhost:8080', platformFeeBasisPoints: 400, platformFeeFixedCents: 30, webhookSecret: 'whsec_test', connectWebhookSecret: 'whsec_connect_test' },
        });
        const cookie = await signUp(app);
        const invoice = await seedInvoice(app, cookie);
        expect(invoice.balanceDue).toBe('115.00');

        const before = await app.request('/api/payments/stripe/account', { headers: { Cookie: cookie } });
        expect(stripeAccountStatusSchema.parse(await before.json()).status).toBe('not_connected');

        const created = await app.request('/api/payments/stripe/account', {
          method: 'POST', headers: { ...originHeaders, Cookie: cookie, 'Idempotency-Key': 'connect-account-1' }, body: '{}',
        });
        expect(created.status).toBe(201);
        expect(stripeAccountStatusSchema.parse(await created.json()).status).toBe('onboarding');

        const onboarding = await app.request('/api/payments/stripe/account/onboarding-link', {
          method: 'POST', headers: { ...originHeaders, Cookie: cookie }, body: JSON.stringify({ platform: 'web' }),
        });
        expect(onboarding.status).toBe(200);
        expect(stripeOnboardingLinkSchema.parse(await onboarding.json()).url).toContain('connect.stripe.com');

        const refreshed = await app.request('/api/payments/stripe/account/refresh', {
          method: 'POST', headers: { ...originHeaders, Cookie: cookie }, body: '{}',
        });
        expect(stripeAccountStatusSchema.parse(await refreshed.json()).status).toBe('active');

        const linkResponse = await app.request(`/api/invoices/${invoice.id}/payment-links`, {
          method: 'POST', headers: { ...originHeaders, Cookie: cookie, 'Idempotency-Key': 'stripe-link-1' }, body: JSON.stringify({ amount: '115.00' }),
        });
        expect(linkResponse.status).toBe(201);
        const link = stripePaymentLinkSchema.parse(await linkResponse.json());
        expect(link.amount).toBe('115.00');
        expect(link.platformFee).toBe('4.90');

        const replayResponse = await app.request(`/api/invoices/${invoice.id}/payment-links`, {
          method: 'POST', headers: { ...originHeaders, Cookie: cookie, 'Idempotency-Key': 'stripe-link-1' }, body: JSON.stringify({ amount: '115.00' }),
        });
        expect(stripePaymentLinkSchema.parse(await replayResponse.json()).id).toBe(link.id);

        const token = link.payUrl.split('/').pop()!;
        const redirect = await app.request(`/api/public/pay/${token}`);
        expect(redirect.status).toBe(302);
        expect(redirect.headers.get('location')).toContain('checkout.stripe.com');

        events.set('paid-event', {
          id: 'evt_test_paid_1', type: 'checkout.session.completed', livemode: false, account: null,
          data: { object: { id: `cs_test_${link.id}`, payment_status: 'paid', amount_total: 11_500, currency: 'nzd', payment_intent: 'pi_test_paid_1', metadata: { organisation_id: token.split('_')[0], payment_link_id: link.id } } },
        });
        const webhook = () => app.request('/api/stripe/webhooks/platform', {
          method: 'POST', headers: { 'stripe-signature': 'test_signature', 'content-type': 'text/plain' }, body: 'paid-event',
        });
        const firstWebhook = await webhook();
        expect(firstWebhook.status, await firstWebhook.clone().text()).toBe(200);
        expect((await webhook()).status).toBe(200);

        const settled = invoiceSchema.parse(await (await app.request(`/api/invoices/${invoice.id}`, { headers: { Cookie: cookie } })).json());
        expect(settled.paymentStatus).toBe('paid');
        expect(settled.balanceDue).toBe('0.00');

        const finalLink = stripePaymentLinkSchema.parse(await (await app.request(`/api/invoices/${invoice.id}/payment-links/${link.id}`, { headers: { Cookie: cookie } })).json());
        expect(finalLink.status).toBe('paid');
        expect(finalLink.paymentId).toBeTruthy();
        expect(finalLink.receiptId).toBeTruthy();

        const receipt = paymentReceiptSchema.parse(await (await app.request(`/api/receipts/${finalLink.receiptId}`, { headers: { Cookie: cookie } })).json());
        expect(receipt.receiptData).toMatchObject({ provider: 'stripe', paymentIntentId: 'pi_test_paid_1' });
        expect(await sql.unsafe(`SELECT id FROM payments WHERE invoice_id = ?`, [invoice.id])).toHaveLength(1);
        expect(await sql.unsafe(`SELECT event_id FROM stripe_events WHERE event_id = 'evt_test_paid_1'`)).toHaveLength(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
