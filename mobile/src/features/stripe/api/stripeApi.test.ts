import { apiRequest } from '@/features/auth/api/http';
import { stripeApi } from './stripeApi';

jest.mock('@/features/auth/api/http', () => ({ apiRequest: jest.fn() }));
jest.mock('@/utils/id', () => ({ randomId: () => '11111111-1111-4111-8111-111111111111' }));

describe('mobile Stripe API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requests a mobile onboarding link', async () => {
    jest.mocked(apiRequest).mockResolvedValue({ url: 'https://connect.stripe.com/test', expiresAt: '2026-11-06T00:00:00.000Z' });
    await stripeApi.onboardingLink();
    expect(apiRequest).toHaveBeenCalledWith('/api/payments/stripe/account/onboarding-link', {
      method: 'POST',
      body: JSON.stringify({ platform: 'mobile' }),
    });
  });

  it('creates an invoice payment link with an idempotency key', async () => {
    await stripeApi.createPaymentLink('invoice-1');
    expect(apiRequest).toHaveBeenCalledWith('/api/invoices/invoice-1/payment-links', {
      method: 'POST',
      headers: { 'Idempotency-Key': '11111111-1111-4111-8111-111111111111' },
      body: '{}',
    });
  });
});
