import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { StripeSettingsSection } from './StripeSettingsSection';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { stripeApi } from '@/features/stripe/api/stripeApi';

jest.mock('@/services/capabilitiesService', () => ({ getServerCapabilities: jest.fn() }));
jest.mock('@/features/stripe/api/stripeApi', () => ({ stripeApi: { account: jest.fn(), createAccount: jest.fn(), onboardingLink: jest.fn(), refreshAccount: jest.fn() } }));

describe('StripeSettingsSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stays hidden when Stripe is unavailable', async () => {
    jest.mocked(getServerCapabilities).mockResolvedValue({ email: 'available', ai: 'unavailable', stripe: 'unavailable' });
    const view = render(<StripeSettingsSection canManage />);
    await waitFor(() => expect(getServerCapabilities).toHaveBeenCalled());
    expect(view.queryByText('Card payments')).toBeNull();
    expect(stripeApi.account).not.toHaveBeenCalled();
  });

  it('shows pending approval without claiming a ready connected account is payment enabled',async()=>{
    jest.mocked(getServerCapabilities).mockResolvedValue({email:'available',ai:'unavailable',stripe:'available'});
    jest.mocked(stripeApi.account).mockResolvedValue({status:'active',chargesEnabled:true,payoutsEnabled:true,detailsSubmitted:true,requirementsDue:[],disabledReason:null,paymentsApproved:false});
    const view=render(<StripeSettingsSection canManage/>);expect(await view.findByText('Card payments await beta approval')).toBeTruthy();expect(view.queryByText('Ready to accept card payments')).toBeNull();
  });

  it('starts mobile onboarding when available', async () => {
    jest.mocked(getServerCapabilities).mockResolvedValue({ email: 'available', ai: 'unavailable', stripe: 'available' });
    jest.mocked(stripeApi.account).mockResolvedValue({ status: 'not_connected', chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [], disabledReason: null });
    jest.mocked(stripeApi.createAccount).mockResolvedValue({ status: 'onboarding', chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [], disabledReason: null });
    jest.mocked(stripeApi.onboardingLink).mockResolvedValue({ url: 'https://connect.stripe.com/test', expiresAt: '2026-11-06T00:00:00.000Z' });
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const view = render(<StripeSettingsSection canManage />);
    fireEvent.press(await view.findByText('Set up card payments'));
    await waitFor(() => expect(stripeApi.createAccount).toHaveBeenCalled());
    expect(stripeApi.onboardingLink).toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith('https://connect.stripe.com/test');
  });
});
