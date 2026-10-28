import Stripe from 'stripe';
import type { StripeConfig, StripeGateway, StripeRemoteAccount, StripeWebhookEvent } from './stripe.gateway';

const STRIPE_API_VERSION = '2026-09-30.endive' as const;

function remoteAccount(account: Stripe.Account): StripeRemoteAccount {
  return {
    id: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirementsDue: account.requirements?.currently_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

export function createStripeGateway(secretKey: string): StripeGateway {
  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
  return {
    async createConnectedAccount(input) {
      const account = await stripe.accounts.create({
        country: input.country,
        default_currency: 'nzd',
        email: input.email,
        business_profile: { name: input.businessName },
        controller: {
          stripe_dashboard: { type: 'express' },
          fees: { payer: 'application' },
          losses: { payments: 'application' },
          requirement_collection: 'stripe',
        },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { organisation_id: input.organisationId },
      }, { idempotencyKey: input.idempotencyKey });
      return remoteAccount(account);
    },
    async retrieveConnectedAccount(accountId) {
      return remoteAccount(await stripe.accounts.retrieve(accountId));
    },
    async createAccountLink(input) {
      const link = await stripe.accountLinks.create({
        account: input.accountId,
        type: 'account_onboarding',
        return_url: input.returnUrl,
        refresh_url: input.refreshUrl,
        collection_options: { fields: 'eventually_due', future_requirements: 'include' },
      });
      return { url: link.url, expiresAt: link.expires_at };
    },
    async createCheckoutSession(input, idempotencyKey) {
      const metadata = { organisation_id: input.organisationId, payment_link_id: input.paymentLinkId };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.paymentLinkId,
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        customer_email: input.customerEmail ?? undefined,
        metadata,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'nzd',
            unit_amount: input.amountCents,
            product_data: { name: `Invoice ${input.invoiceNumber}`, description: 'EasyBiz invoice payment' },
          },
        }],
        payment_intent_data: {
          application_fee_amount: input.platformFeeCents,
          on_behalf_of: input.connectedAccountId,
          transfer_data: { destination: input.connectedAccountId },
          metadata,
        },
      }, { idempotencyKey });
      if (!session.url) throw new Error('Stripe Checkout did not return a hosted URL');
      return { id: session.id, url: session.url, expiresAt: session.expires_at };
    },
    async expireCheckoutSession(sessionId) {
      await stripe.checkout.sessions.expire(sessionId);
    },
    async constructWebhookEvent(payload, signature, secret) {
      const event = await stripe.webhooks.constructEventAsync(
        new TextDecoder().decode(payload), signature, secret, 300, Stripe.createSubtleCryptoProvider(),
      );
      return event as unknown as StripeWebhookEvent;
    },
  };
}

export function stripeRuntimeFromEnv(env: Record<string, string | undefined>): { gateway: StripeGateway; config: StripeConfig } | undefined {
  if (env.STRIPE_PAYMENTS_ENABLED !== 'true') return undefined;
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const connectWebhookSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret || !connectWebhookSecret) throw new Error('Stripe payments are enabled but Stripe secrets are incomplete');
  const mode = /^(?:sk|rk|rkcs)_test_/.test(secretKey) ? 'test' : /^(?:sk|rk)_live_/.test(secretKey) ? 'live' : undefined;
  if (!mode) throw new Error('Stripe secret key must be a test or live secret key');
  const basisPoints = Number(env.STRIPE_PLATFORM_FEE_BPS ?? '400');
  const fixedCents = Number(env.STRIPE_PLATFORM_FEE_FIXED_CENTS ?? '30');
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) throw new Error('STRIPE_PLATFORM_FEE_BPS must be an integer from 0 to 10000');
  if (!Number.isSafeInteger(fixedCents) || fixedCents < 0) throw new Error('STRIPE_PLATFORM_FEE_FIXED_CENTS must be a non-negative integer');
  return {
    gateway: createStripeGateway(secretKey),
    config: {
      enabled: true, mode,
      appUrl: (env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
      platformFeeBasisPoints: basisPoints,
      platformFeeFixedCents: fixedCents,
      webhookSecret, connectWebhookSecret,
    },
  };
}
