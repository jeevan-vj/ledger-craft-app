import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe,it,expect,vi } from 'vitest';
import { BankFeedsPanel } from './BankFeedsPanel';
import { bankFeedsApi } from './bankFeedsApi';
vi.mock('./bankFeedsApi',()=>({bankFeedsApi:{summary:vi.fn(),sync:vi.fn(),disconnect:vi.fn()}}));
function show(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}})}><BankFeedsPanel canManage /></QueryClientProvider>);}
describe('bank feeds panel',()=>{
 it('shows unavailable capability without a fake connect action',async()=>{vi.mocked(bankFeedsApi.summary).mockResolvedValue({mode:'unavailable',fullAppAvailable:false,status:'not_connected',lastAttemptAt:null,lastSyncedAt:null,nextSyncAt:null,accounts:[],warnings:['Personal App credentials required.']});show();expect(await screen.findByText('Personal App credentials required.')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Refresh Akahu feeds'})).not.toBeInTheDocument();});
 it('shows inactive provider account and original sync state',async()=>{vi.mocked(bankFeedsApi.summary).mockResolvedValue({mode:'personal',fullAppAvailable:false,status:'connected',lastAttemptAt:null,lastSyncedAt:'2026-11-01T00:00:00Z',nextSyncAt:null,accounts:[{id:'one',bankAccountId:'11111111-1111-1111-1111-111111111111',name:'Operating',institution:'Bank',currency:'NZD',status:'INACTIVE',lastSyncedAt:null}],warnings:['An account is inactive. Review it in Akahu.']});show();expect(await screen.findByText('Operating')).toBeInTheDocument();expect(screen.getByText(/An account is inactive/)).toBeInTheDocument();expect(screen.queryByRole('link',{name:/connect/i})).not.toBeInTheDocument();});
 it('shows a retryable error instead of an empty connected state',async()=>{
  vi.mocked(bankFeedsApi.summary).mockRejectedValueOnce(new Error('Network unavailable'));show();expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
  vi.mocked(bankFeedsApi.summary).mockResolvedValue({mode:'unavailable',fullAppAvailable:false,status:'not_connected',lastAttemptAt:null,lastSyncedAt:null,nextSyncAt:null,accounts:[],warnings:[]});fireEvent.click(screen.getByRole('button',{name:'Retry bank connections'}));expect(await screen.findByText('No connected accounts.')).toBeInTheDocument();
 });

});
