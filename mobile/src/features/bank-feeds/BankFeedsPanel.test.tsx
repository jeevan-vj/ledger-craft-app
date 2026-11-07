import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BankFeedsPanel } from './BankFeedsPanel';
import { bankFeedsApi } from './bankFeedsApi';
jest.mock('./bankFeedsApi',()=>({bankFeedsApi:{summary:jest.fn()}}));
it('shows unavailable bank feed state without OAuth or native access claims',async()=>{
 jest.mocked(bankFeedsApi.summary).mockResolvedValue({mode:'unavailable',fullAppAvailable:false,status:'not_connected',lastAttemptAt:null,lastSyncedAt:null,nextSyncAt:null,accounts:[],warnings:['Personal App credentials required.']});
 const s=render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}})}><BankFeedsPanel /></QueryClientProvider>);
 expect(await s.findByText('Personal App credentials required.')).toBeTruthy();
});

it('shows an actionable retry after a failed request and then the inactive account',async()=>{
 jest.mocked(bankFeedsApi.summary).mockRejectedValueOnce(new Error('Network unavailable'));
 const s=render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}})}><BankFeedsPanel /></QueryClientProvider>);
 expect(await s.findByText('Network unavailable')).toBeTruthy();
 jest.mocked(bankFeedsApi.summary).mockResolvedValue({mode:'personal',fullAppAvailable:false,status:'connected',lastAttemptAt:null,lastSyncedAt:null,nextSyncAt:null,accounts:[{id:'one',bankAccountId:'11111111-1111-1111-1111-111111111111',name:'Operating',institution:'Bank',currency:'NZD',status:'INACTIVE',lastSyncedAt:null}],warnings:['An account is inactive.']});
 fireEvent.press(s.getByText('Retry bank connections'));expect(await s.findByText('Operating')).toBeTruthy();expect(s.getByText('An account is inactive.')).toBeTruthy();
});
