import Stripe from 'stripe';
import type { StripeConfig, StripeGateway, StripeRemoteAccount, StripeWebhookEvent } from './stripe.gateway';
import { paymentFacts } from './stripe.remote';
import { createMockStripeGateway } from './stripe.mock-gateway';

const STRIPE_API_VERSION = '2026-09-30.endive' as const;

function platformFees(env: Record<string, string | undefined>) {
  const basisPoints = Number(env.STRIPE_PLATFORM_FEE_BPS ?? '400');
  const fixedCents = Number(env.STRIPE_PLATFORM_FEE_FIXED_CENTS ?? '30');
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) throw new Error('STRIPE_PLATFORM_FEE_BPS must be an integer from 0 to 10000');
  if (!Number.isSafeInteger(fixedCents) || fixedCents < 0) throw new Error('STRIPE_PLATFORM_FEE_FIXED_CENTS must be a non-negative integer');
  return { basisPoints, fixedCents };
}

function requireLocalMockUrl(appUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(appUrl).hostname;
  } catch {
    throw new Error('Stripe mock mode requires a local APP_URL');
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) throw new Error('Stripe mock mode requires a local APP_URL');
}

function localAppUrl(appUrl: string | undefined): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(appUrl ?? '').hostname);
  } catch {
    return false;
  }
}

function oakSandboxContext(secretKey: string, env: Record<string, string | undefined> | undefined): string | undefined {
  // Stripe CLI sandbox sessions use an oak_ user token. The prefix can say oak_live_
  // while the context is a sandbox, so this stays test mode and only on a local app.
  if (!env || env.NODE_ENV === 'production' || !/^oak_(?:live|test)_/.test(secretKey) || !localAppUrl(env.APP_URL)) return undefined;
  const context = env.STRIPE_CONTEXT?.trim();
  return context && /^acct_[A-Za-z0-9]+$/.test(context) ? context : undefined;
}

function secretKeyMode(secretKey: string, env?: Record<string, string | undefined>): 'test' | 'live' | undefined {
  if (/^(?:sk|rk|rkcs)_test_/.test(secretKey)) return 'test';
  if (/^(?:sk|rk)_live_/.test(secretKey)) return 'live';
  if (oakSandboxContext(secretKey, env)) return 'test';
  return undefined;
}

function stripeAvailability(env: Record<string, string | undefined>): { capability: 'available' | 'unavailable'; error?: string } {
  if (env.STRIPE_PAYMENTS_ENABLED !== 'true') return { capability: 'unavailable' };
  try {
    platformFees(env);
    if (env.STRIPE_MOCK_MODE === 'true') {
      if (env.NODE_ENV === 'production') return { capability: 'unavailable', error: 'Stripe mock mode is not available in production' };
      requireLocalMockUrl((env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, ''));
      return { capability: 'available' };
    }
    const secretKey = env.STRIPE_SECRET_KEY?.trim();
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
    const connectWebhookSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
    return { capability: secretKey && webhookSecret && connectWebhookSecret && secretKeyMode(secretKey, env) ? 'available' : 'unavailable' };
  } catch (error) {
    return { capability: 'unavailable', error: error instanceof Error ? error.message : 'Stripe configuration is invalid' };
  }
}

export function stripePaymentsCapability(env: Record<string, string | undefined>): 'available' | 'unavailable' {
  return stripeAvailability(env).capability;
}

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

function sandboxLivemodeClient(): Stripe.HttpClient {
  // A CLI sandbox token is refused on Accounts v2 unless the request says the
  // context is not live. Normal secret keys never take this client.
  const client = Stripe.createFetchHttpClient();
  const makeRequest = client.makeRequest.bind(client);
  client.makeRequest = (host, port, path, method, headers, requestData, protocol, timeout) =>
    makeRequest(host, port, path, method, { ...headers, 'Stripe-Livemode': 'false' }, requestData, protocol, timeout);
  return client;
}

export function createStripeGateway(secretKey: string, stripeContext?: string): StripeGateway {
  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: stripeContext ? sandboxLivemodeClient() : Stripe.createFetchHttpClient(),
    ...(stripeContext ? { stripeContext } : {}),
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
    async retrieveCheckoutPayment(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid' || typeof session.payment_intent !== 'string') throw new Error('Stripe Checkout is not paid');
      return paymentFacts(await stripe.paymentIntents.retrieve(session.payment_intent, { expand: ['latest_charge.application_fee'] }), session.id);
    },
    async listRecentPayments(organisationId, destinationAccountId, since) {
      const items = [];
      let after: string | undefined;
      for (let page = 0; page < 100; page++) {
        const batch = await stripe.paymentIntents.list({ created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100, ...(after ? { starting_after: after } : {}), expand: ['data.latest_charge.application_fee'] });
        for (const intent of batch.data) {
          const facts = paymentFacts(intent);
          if (facts.organisationId === organisationId || facts.destinationAccountId === destinationAccountId) items.push(facts);
        }
        if (!batch.has_more) return { items, complete: true };
        after = batch.data.at(-1)?.id;
        if (!after) return { items, complete: false };
      }
      return { items, complete: false };
    },
    async retrieveFeePayment(applicationFeeId) {
      const fee = await stripe.applicationFees.retrieve(applicationFeeId);
      const charge = await stripe.charges.retrieve(typeof fee.charge === 'string' ? fee.charge : fee.charge.id);
      const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (!intentId) throw new Error('Stripe application fee has no associated payment intent');
      return paymentFacts(await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge.application_fee'] }));
    },
    async retrievePayment(paymentIntentId) {
      return paymentFacts(await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.application_fee'] }));
    },
    async retrieveBalance(accountId) {
      const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
      const sum = (rows: typeof balance.available) => rows.filter(row => row.currency === 'nzd').reduce((total, row) => total + row.amount, 0);
      return { availableCents: sum(balance.available), pendingCents: sum(balance.pending), currency: 'NZD' };
    },
    async createFullRefund(paymentIntentId, idempotencyKey) {
      const refund = await stripe.refunds.create({ payment_intent: paymentIntentId, reverse_transfer: true, refund_application_fee: true }, { idempotencyKey });
      return { id: refund.id, status: refund.status ?? 'pending' };
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
  const webhookOnly = env.STRIPE_MOCK_MODE !== 'true' && env.STRIPE_PAYMENTS_ENABLED !== 'true' && !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET && !!env.STRIPE_CONNECT_WEBHOOK_SECRET && !!secretKeyMode(env.STRIPE_SECRET_KEY, env);
  const availability = stripeAvailability(webhookOnly ? { ...env, STRIPE_PAYMENTS_ENABLED: 'true' } : env);
  if (availability.capability !== 'available') {
    if (env.STRIPE_MOCK_MODE === 'true' && availability.error) throw new Error(availability.error);
    return undefined;
  }
  const appUrl = (env.APP_URL ?? 'http://localhost:8080').replace(/\/$/, '');
  const mock = env.STRIPE_MOCK_MODE === 'true';
  if (mock) {
    const { basisPoints, fixedCents } = platformFees(env);
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
  if (!secretKey || !webhookSecret || !connectWebhookSecret) return undefined;
  const mode = secretKeyMode(secretKey, env);
  if (!mode) throw new Error('Stripe secret key must be a test or live secret key');
  const { basisPoints, fixedCents } = platformFees(env);
  return {
    gateway: createStripeGateway(secretKey, oakSandboxContext(secretKey, env)),
    config: {
      enabled: env.STRIPE_PAYMENTS_ENABLED === 'true', mode,
      approvedOrganisationIds: (env.STRIPE_APPROVED_ORGANISATION_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean),
      appUrl,
      platformFeeBasisPoints: basisPoints,
      platformFeeFixedCents: fixedCents,
      webhookSecret, connectWebhookSecret,
    },
  };
}
