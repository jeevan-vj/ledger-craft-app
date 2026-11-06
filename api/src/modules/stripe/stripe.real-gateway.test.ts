import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  v1AccountCreate: vi.fn(),
  v2AccountCreate: vi.fn(),
}));

vi.mock('stripe', () => {
  class StripeMock {
    static createFetchHttpClient = vi.fn(() => ({}));
    static createSubtleCryptoProvider = vi.fn(() => ({}));

    accounts = { create: stripeMocks.v1AccountCreate };
    accountLinks = { create: vi.fn() };
    checkout = { sessions: { create: vi.fn(), expire: vi.fn() } };
    webhooks = { constructEventAsync: vi.fn() };
    v2 = {
      core: {
        accounts: {
          create: stripeMocks.v2AccountCreate,
          retrieve: vi.fn(),
        },
        accountLinks: { create: vi.fn() },
      },
    };
  }

  return { default: StripeMock };
});

import { createStripeGateway, stripePaymentsCapability, stripeRuntimeFromEnv } from './stripe.real-gateway';

describe('real Stripe gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeMocks.v2AccountCreate.mockResolvedValue({
      id: 'acct_test_v2',
      configuration: {
        merchant: { capabilities: { card_payments: { status: 'pending', status_details: [] } } },
        recipient: { capabilities: { stripe_balance: { payouts: { status: 'pending', status_details: [] } } } },
      },
      requirements: { entries: [] },
    });
  });

  it('creates a Stripe-responsible Accounts v2 connected account', async () => {
    const gateway = createStripeGateway('rk_test_example');

    await gateway.createConnectedAccount({
      country: 'NZ',
      organisationId: 'org_123',
      businessName: 'Kauri Studio Test Ltd',
      email: 'owner@example.com',
      idempotencyKey: 'connect-account-1',
    });

    expect(stripeMocks.v1AccountCreate).not.toHaveBeenCalled();
    expect(stripeMocks.v2AccountCreate).toHaveBeenCalledWith(expect.objectContaining({
      contact_email: 'owner@example.com',
      dashboard: 'full',
      defaults: expect.objectContaining({
        currency: 'nzd',
        responsibilities: {
          fees_collector: 'stripe',
          losses_collector: 'stripe',
        },
      }),
      identity: { country: 'NZ' },
      metadata: { organisation_id: 'org_123' },
    }), { idempotencyKey: 'connect-account-1' });
  });

  it.each([
    [{}, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'TRUE' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_platform' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect' }, 'available'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_MOCK_MODE: 'true', APP_URL: 'http://localhost:8080' }, 'available'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_MOCK_MODE: 'true', APP_URL: 'https://example.com' }, 'unavailable'],
    [{ STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_MOCK_MODE: 'true', APP_URL: 'http://localhost:8080', NODE_ENV: 'production' }, 'unavailable'],
  ])('reports Stripe capability without exposing configuration (%#)', (env, expected) => {
    expect(stripePaymentsCapability(env)).toBe(expected);
  });

  it('fails closed without crashing when enabled real-mode configuration is incomplete', () => {
    expect(stripeRuntimeFromEnv({ STRIPE_PAYMENTS_ENABLED: 'true' })).toBeUndefined();
  });
});
