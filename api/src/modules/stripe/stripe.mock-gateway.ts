import type { CreateCheckoutSessionInput, StripeGateway, StripeRemoteAccount, StripeWebhookEvent } from './stripe.gateway';

type MockCheckout = CreateCheckoutSessionInput & { id: string; successUrl: string; cancelUrl: string; expiresAt: number; paid: boolean };

export type MockStripeGateway = StripeGateway & {
  readonly mock: true;
  completeAccount(accountId: string): StripeRemoteAccount;
  getCheckout(sessionId: string): MockCheckout | undefined;
  completeCheckout(sessionId: string): StripeWebhookEvent;
};

function pendingAccount(id: string): StripeRemoteAccount {
  return {
    id,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    requirementsDue: ['Business details', 'Representative details', 'Test payout account'],
    disabledReason: null,
  };
}

export function isMockStripeGateway(gateway: StripeGateway | undefined): gateway is MockStripeGateway {
  return Boolean(gateway && 'mock' in gateway && (gateway as { mock?: unknown }).mock === true);
}

export function createMockStripeGateway(appUrl: string): MockStripeGateway {
  const baseUrl = appUrl.replace(/\/$/, '');
  const accounts = new Map<string, StripeRemoteAccount>();
  const checkouts = new Map<string, MockCheckout>();
  return {
    mock: true,
    createConnectedAccount(input) {
      const id = `acct_mock_${input.organisationId}`;
      const account = accounts.get(id) ?? pendingAccount(id);
      accounts.set(id, account);
      return Promise.resolve(account);
    },
    retrieveConnectedAccount(accountId) {
      const account = accounts.get(accountId);
      if (!account) return Promise.reject(new Error('Unknown mock Stripe account'));
      return Promise.resolve(account);
    },
    createAccountLink(input) {
      const params = new URLSearchParams({ return_url: input.returnUrl, refresh_url: input.refreshUrl });
      return Promise.resolve({
        url: `${baseUrl}/api/stripe/mock/onboarding/${encodeURIComponent(input.accountId)}?${params}`,
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
      });
    },
    createCheckoutSession(input) {
      const id = `cs_mock_${crypto.randomUUID()}`;
      const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
      checkouts.set(id, { ...input, id, expiresAt, paid: false });
      return Promise.resolve({ id, url: `${baseUrl}/api/stripe/mock/checkout/${id}`, expiresAt });
    },
    expireCheckoutSession(sessionId) {
      checkouts.delete(sessionId);
      return Promise.resolve();
    },
    constructWebhookEvent(payload, signature, secret) {
      if (signature !== 'mock_signature' || secret !== 'whsec_mock') return Promise.reject(new Error('Invalid mock signature'));
      return Promise.resolve(JSON.parse(new TextDecoder().decode(payload)) as StripeWebhookEvent);
    },
    completeAccount(accountId) {
      if (!accounts.has(accountId)) throw new Error('Unknown mock Stripe account');
      const account: StripeRemoteAccount = {
        id: accountId, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true,
        requirementsDue: [], disabledReason: null,
      };
      accounts.set(accountId, account);
      return account;
    },
    getCheckout(sessionId) {
      return checkouts.get(sessionId);
    },
    completeCheckout(sessionId) {
      const checkout = checkouts.get(sessionId);
      if (!checkout) throw new Error('Unknown mock Checkout Session');
      checkout.paid = true;
      return {
        id: `evt_mock_${sessionId}`,
        type: 'checkout.session.completed',
        livemode: false,
        account: null,
        data: {
          object: {
            id: checkout.id,
            payment_status: 'paid',
            amount_total: checkout.amountCents,
            currency: 'nzd',
            payment_intent: `pi_mock_${checkout.id}`,
            metadata: {
              organisation_id: checkout.organisationId,
              payment_link_id: checkout.paymentLinkId,
            },
          },
        },
      };
    },
  };
}
