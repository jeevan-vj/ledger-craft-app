import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { StripeOperationsSection } from './StripeOperationsSection';
import { stripeApi } from '@/features/stripe/api/stripeApi';
jest.mock('@/features/stripe/api/stripeApi',()=>({stripeApi:{balance:jest.fn(),operations:jest.fn(),settlements:jest.fn(),verify:jest.fn(),refund:jest.fn()}}));
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{gcTime:Infinity}}})}><StripeOperationsSection/></QueryClientProvider>);}
describe('mobile Stripe review',()=>{
 beforeEach(()=>{jest.clearAllMocks();jest.mocked(stripeApi.balance).mockResolvedValue({currency:'NZD',available:'95.70',pending:'0.00',ledgerClearing:'95.70',difference:'0.00',checkedAt:'2026-11-07T00:00:00.000Z',warnings:[]});jest.mocked(stripeApi.operations).mockResolvedValue({items:[]});jest.mocked(stripeApi.settlements).mockResolvedValue({items:[{id:'p1',invoiceId:'i1',amount:'100.00',platformFee:'4.30',paymentDate:'2026-11-07',status:'completed'}]});});
 it('shows exact balances and verifies without issuing a refund',async()=>{jest.mocked(stripeApi.verify).mockResolvedValue({id:'v1',result:'match',differences:[],checkedAt:'2026-11-07T00:00:00.000Z'});const view=mount();expect(await view.findByText('Available: NZD 95.70')).toBeTruthy();fireEvent.press(view.getByText('Verify with Stripe'));expect(await view.findByText('match')).toBeTruthy();expect(stripeApi.refund).not.toHaveBeenCalled();});
 it('requires confirmation and reason before requesting refund',async()=>{jest.mocked(stripeApi.refund).mockResolvedValue({id:'r1',status:'pending',awaitingWebhook:true});const view=mount();await view.findByText('Request full refund');fireEvent.changeText(view.getByLabelText('Full refund reason'),'Customer requested cancellation');fireEvent.press(view.getByLabelText('I confirm a full Stripe refund and transfer reversal'));fireEvent.press(view.getByText('Request full refund'));expect(await view.findByText('Refund requested. Awaiting Stripe webhook confirmation.')).toBeTruthy();});
 it('shows retry guidance when provider review fails',async()=>{jest.mocked(stripeApi.balance).mockRejectedValue(new Error('Stripe unavailable'));const view=mount();expect(await view.findByText('Stripe unavailable')).toBeTruthy();expect(view.getByText('Retry Stripe review')).toBeTruthy();});
});
