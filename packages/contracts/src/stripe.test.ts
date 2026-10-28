import { describe, expect, it } from 'vitest';
import {
  createStripePaymentLinkRequestSchema,
  stripeAccountStatusSchema,
  stripeOnboardingLinkSchema,
  stripePaymentLinkSchema,
} from './stripe';

describe('Stripe Connect contracts', () => {
  it('accepts an active connected account without exposing ownership fields', () => {
    const value = stripeAccountStatusSchema.parse({
      status: 'active',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: [],
      disabledReason: null,
    });
    expect(value.status).toBe('active');
    expect(() => stripeAccountStatusSchema.parse({ ...value, organisationId: crypto.randomUUID() })).toThrow();
  });

  it('requires HTTPS for single-use onboarding links', () => {
    expect(stripeOnboardingLinkSchema.parse({
      url: 'https://connect.stripe.com/setup/s/test',
      expiresAt: '2026-10-29T02:00:00.000Z',
    }).url).toContain('connect.stripe.com');
    expect(() => stripeOnboardingLinkSchema.parse({
      url: 'http://connect.stripe.com/setup/s/test',
      expiresAt: '2026-10-29T02:00:00.000Z',
    })).toThrow();
  });

  it('accepts exact invoice amounts and rejects fractions of a cent', () => {
    expect(createStripePaymentLinkRequestSchema.parse({ amount: '123.45' })).toEqual({ amount: '123.45' });
    expect(createStripePaymentLinkRequestSchema.parse({})).toEqual({});
    for (const amount of ['0', '0.001', '-1', '1e3']) {
      expect(() => createStripePaymentLinkRequestSchema.parse({ amount })).toThrow();
    }
  });

  it('describes the public link without exposing Stripe secrets', () => {
    const value = stripePaymentLinkSchema.parse({
      id: crypto.randomUUID(),
      invoiceId: crypto.randomUUID(),
      status: 'open',
      amount: '123.45',
      currency: 'NZD',
      platformFee: '5.24',
      payUrl: 'https://easybiz.iamjeevan.com/pay/token',
      expiresAt: '2026-10-30T01:00:00.000Z',
      createdAt: '2026-10-29T01:00:00.000Z',
      paymentId: null,
      receiptId: null,
    });
    expect(value.currency).toBe('NZD');
    expect(JSON.stringify(value)).not.toMatch(/secret|checkoutSessionId|paymentIntentId/i);
  });
});
