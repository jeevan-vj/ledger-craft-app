import { describe, expect, it } from 'vitest';
import { stripeRuntimeFromEnv } from './stripe.real-gateway';

describe('local Stripe mock runtime', () => {
  it('enables a deterministic test gateway without Stripe secrets outside production', async () => {
    const runtime = stripeRuntimeFromEnv({
      NODE_ENV: 'development',
      STRIPE_PAYMENTS_ENABLED: 'true',
      STRIPE_MOCK_MODE: 'true',
      APP_URL: 'http://127.0.0.1:8080',
      STRIPE_PLATFORM_FEE_BPS: '400',
      STRIPE_PLATFORM_FEE_FIXED_CENTS: '30',
    });

    expect(runtime?.config).toMatchObject({ enabled: true, mode: 'test', mock: true });
    const account = await runtime!.gateway.createConnectedAccount({
      country: 'NZ', organisationId: 'org_123', businessName: 'Kauri Studio',
      email: 'owner@example.com', idempotencyKey: 'connect-1',
    });
    expect(account).toMatchObject({ chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false });
    const link = await runtime!.gateway.createAccountLink({
      accountId: account.id,
      returnUrl: 'http://127.0.0.1:8080/settings?tab=payments&stripe=return',
      refreshUrl: 'http://127.0.0.1:8080/settings?tab=payments&stripe=refresh',
    });
    expect(link.url).toMatch(/^http:\/\/127\.0\.0\.1:8080\/api\/stripe\/mock\/onboarding\//);
  });

  it('refuses mock mode in production', () => {
    expect(() => stripeRuntimeFromEnv({
      NODE_ENV: 'production', STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_MOCK_MODE: 'true',
    })).toThrow('Stripe mock mode is not available in production');
  });

  it('refuses mock mode for a non-local app URL', () => {
    expect(() => stripeRuntimeFromEnv({
      NODE_ENV: 'development', STRIPE_PAYMENTS_ENABLED: 'true', STRIPE_MOCK_MODE: 'true',
      APP_URL: 'https://ledgercraft.example.com',
    })).toThrow('Stripe mock mode requires a local APP_URL');
  });
});
