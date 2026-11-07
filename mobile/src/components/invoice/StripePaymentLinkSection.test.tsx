import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { StripePaymentLinkSection } from './StripePaymentLinkSection';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { stripeApi } from '@/features/stripe/api/stripeApi';

jest.mock('@/services/capabilitiesService', () => ({ getServerCapabilities: jest.fn() }));
jest.mock('@/features/stripe/api/stripeApi', () => ({ stripeApi: { createPaymentLink: jest.fn(), account: jest.fn() } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const eligible = { invoiceId: 'invoice-1', currency: 'NZD', status: 'sent', balanceDue: '115.00' };

describe('StripePaymentLinkSection', () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(stripeApi.account).mockResolvedValue({status:'active',chargesEnabled:true,payoutsEnabled:true,detailsSubmitted:true,requirementsDue:[],disabledReason:null,paymentsApproved:true}); });

  it('hides the action when Stripe is unavailable', async () => {
    jest.mocked(getServerCapabilities).mockResolvedValue({ email: 'available', ai: 'unavailable', stripe: 'unavailable' });
    const view = render(<StripePaymentLinkSection {...eligible} />);
    await waitFor(() => expect(getServerCapabilities).toHaveBeenCalled());
    expect(view.queryByText('Get paid by card')).toBeNull();
  });

  it.each([
    { currency: 'AUD', status: 'sent', balanceDue: '115.00' },
    { currency: 'NZD', status: 'cancelled', balanceDue: '115.00' },
    { currency: 'NZD', status: 'paid', balanceDue: '0.00' },
  ])('does not probe or render for an ineligible invoice (%#)', async (invoice) => {
    const view = render(<StripePaymentLinkSection invoiceId="invoice-1" {...invoice} />);
    expect(view.queryByText('Get paid by card')).toBeNull();
    expect(getServerCapabilities).not.toHaveBeenCalled();
  });

  it('hides a company waiting for beta approval', async()=>{
    jest.mocked(getServerCapabilities).mockResolvedValue({email:'available',ai:'unavailable',stripe:'available'});jest.mocked(stripeApi.account).mockResolvedValue({status:'active',chargesEnabled:true,payoutsEnabled:true,detailsSubmitted:true,requirementsDue:[],disabledReason:null,paymentsApproved:false});
    const view=render(<StripePaymentLinkSection {...eligible}/>);await waitFor(()=>expect(stripeApi.account).toHaveBeenCalled());expect(view.queryByText('Get paid by card')).toBeNull();
  });

  it('creates and copies a hosted payment link when available', async () => {
    jest.mocked(getServerCapabilities).mockResolvedValue({ email: 'available', ai: 'unavailable', stripe: 'available' });
    jest.mocked(stripeApi.createPaymentLink).mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111', invoiceId: '22222222-2222-4222-8222-222222222222', status: 'open', amount: '115.00', currency: 'NZD', platformFee: '4.90', payUrl: 'https://example.test/pay/token', expiresAt: '2026-11-07T00:00:00.000Z', createdAt: '2026-11-06T00:00:00.000Z', paymentId: null, receiptId: null,
    });
    const view = render(<StripePaymentLinkSection {...eligible} />);
    fireEvent.press(await view.findByText('Get paid by card'));
    fireEvent.press(await view.findByText('Copy payment link'));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://example.test/pay/token'));
    expect(stripeApi.createPaymentLink).toHaveBeenCalledWith('invoice-1');
  });
});
