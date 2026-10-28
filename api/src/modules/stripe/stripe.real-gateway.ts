import Stripe from 'stripe';
import type { StripeConfig, StripeGateway, StripeRemoteAccount, StripeWebhookEvent } from './stripe.gateway';
import { createMockStripeGateway } from './stripe.mock-gateway';

const STRIPE_API_VERSION = '2026-09-30.endive' as const;

function remoteAccount(account: Stripe.V2.Core.Account): StripeRemoteAccount {
  const cardPayments = account.configuration?.merchant?.capabilities?.card_payments;
  const payouts = account.configuration?.recipient?.capabilities?.stripe_balance?.payouts;
  const requirements = account.requirements?.entries ?? [];
  const blockingCapability = [cardPayments, payouts].find((capability) =>
    capability && capability.status !== 'active' && capability.status !== 'pending');
  return {
    id: account.id,
    chargesEnabled: cardPayments?.status === 'active',
    payoutsEnabled: payouts?.status === 'active',
    detailsSubmitted: !requirements.some((requirement) => requirement.awaiting_action_from === 'user'),
    requirementsDue: requirements
      .filter((requirement) => requirement.awaiting_action_from === 'user')
      .map((requirement) => requirement.description),
    disabledReason: blockingCapability?.status_details[0]?.code ?? null,
  };
}

export function createStripeGateway(secretKey: string): StripeGateway {
  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
  return {
    async createConnectedAccount(input) {
      const account = await stripe.v2.core.accounts.create({
        contact_email: input.email,
        dashboard: 'full',
        defaults: {
          currency: 'nzd',
          profile: { doing_business_as: input.businessName },
          responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
        },
        display_name: input.businessName,
        identity: { country: input.country },
        configuration: {
          merchant: { capabilities: { card_payments: { requested: true } } },
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        include: ['configuration.merchant', 'configuration.recipient', 'requirements'],
        metadata: { organisation_id: input.organisationId },
      }, { idempotencyKey: input.idempotencyKey });
      return remoteAccount(account);
    },
    async retrieveConnectedAccount(accountId) {
      return remoteAccount(await stripe.v2.core.accounts.retrieve(accountId, {
        include: ['configuration.merchant', 'configuration.recipient', 'requirements'],
      }));
    },
    async createAccountLink(input) {
      const link = await stripe.v2.core.accountLinks.create({
        account: input.accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            return_url: input.returnUrl,
            refresh_url: input.refreshUrl,
            collection_options: { fields: 'eventually_due', future_requirements: 'include' },
          },
        },
      });
      return { url: link.url, expiresAt: Math.floor(Date.parse(link.expires_at) / 1000) };
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
  const appUrl = (env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, '');
  const mock = env.STRIPE_MOCK_MODE === 'true';
  if (mock && env.NODE_ENV === 'production') throw new Error('Stripe mock mode is not available in production');
  if (mock) {
    let hostname: string;
    try {
      hostname = new URL(appUrl).hostname;
    } catch {
      throw new Error('Stripe mock mode requires a local APP_URL');
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
      throw new Error('Stripe mock mode requires a local APP_URL');
    }
    const basisPoints = Number(env.STRIPE_PLATFORM_FEE_BPS ?? '400');
    const fixedCents = Number(env.STRIPE_PLATFORM_FEE_FIXED_CENTS ?? '30');
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) throw new Error('STRIPE_PLATFORM_FEE_BPS must be an integer from 0 to 10000');
    if (!Number.isSafeInteger(fixedCents) || fixedCents < 0) throw new Error('STRIPE_PLATFORM_FEE_FIXED_CENTS must be a non-negative integer');
    return {
      gateway: createMockStripeGateway(appUrl),
      config: {
        enabled: true, mode: 'test', mock: true, appUrl,
        platformFeeBasisPoints: basisPoints, platformFeeFixedCents: fixedCents,
        webhookSecret: 'whsec_mock', connectWebhookSecret: 'whsec_mock',
      },
    };
  }
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
      appUrl,
      platformFeeBasisPoints: basisPoints,
      platformFeeFixedCents: fixedCents,
      webhookSecret, connectWebhookSecret,
    },
  };
}
