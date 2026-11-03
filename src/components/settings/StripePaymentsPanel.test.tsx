import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripePaymentsPanel } from './StripePaymentsPanel';
import { stripeApi } from '@/features/stripe/api/stripeApi';

vi.mock('@/features/stripe/api/stripeApi', () => ({
  stripeApi: { account: vi.fn(), createAccount: vi.fn(), onboardingLink: vi.fn(), refreshAccount: vi.fn() },
}));

describe('StripePaymentsPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('open', vi.fn()); });

  it('starts Stripe-hosted onboarding for a disconnected organisation', async () => {
    vi.mocked(stripeApi.account).mockResolvedValue({ status: 'not_connected', chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [], disabledReason: null });
    vi.mocked(stripeApi.createAccount).mockResolvedValue({ status: 'onboarding', chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [], disabledReason: null });
    vi.mocked(stripeApi.onboardingLink).mockResolvedValue({ url: 'https://connect.stripe.com/setup/test', expiresAt: '2026-10-29T02:00:00.000Z' });
    render(<StripePaymentsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /set up stripe payments/i }));
    await waitFor(() => expect(stripeApi.createAccount).toHaveBeenCalled());
    expect(stripeApi.onboardingLink).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith('https://connect.stripe.com/setup/test', '_self', 'noopener,noreferrer');
  });

  it('shows enabled charges and payouts without displaying account secrets', async () => {
    vi.mocked(stripeApi.account).mockResolvedValue({ status: 'active', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: [], disabledReason: null });
    const view = render(<StripePaymentsPanel />);
    expect(await screen.findByText('Ready to accept card payments')).toBeInTheDocument();
    expect(screen.getByText('Charges enabled')).toBeInTheDocument();
    expect(screen.getByText('Payouts enabled')).toBeInTheDocument();
    expect(view.container.textContent).not.toMatch(/acct_|sk_test|whsec_/);
  });
});
