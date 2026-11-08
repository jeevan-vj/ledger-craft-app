import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { AccountingPeriodsPanel } from './AccountingPeriodsPanel';
import { accountingPeriodsApi } from '@/features/accounting-completion/accountingPeriodsApi';
vi.mock('@/features/accounting-completion/accountingPeriodsApi',()=>({accountingPeriodsApi:{get:vi.fn(),close:vi.fn(),reopen:vi.fn()}}));
vi.mock('@/context/StableAuthContext',()=>({useAuth:()=>({me:{organisation:{id:'company'},permissions:['banking.read']}})}));
const opened={closedThrough:null,revision:0,canClose:true,canReopen:true,events:[]};
const closed={...opened,closedThrough:'2026-10-31',revision:1,events:[{id:'event',action:'close' as const,previousClosedThrough:null,newClosedThrough:'2026-10-31',reason:'October books checked',actorId:'owner',createdAt:'2026-11-08T00:00:00Z',revision:1}]};
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><AccountingPeriodsPanel/></QueryClientProvider>);}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(accountingPeriodsApi.get).mockResolvedValue(opened);vi.mocked(accountingPeriodsApi.close).mockResolvedValue(closed);});
it('requires reviewed dates/reason, sends current revision and displays retained close history',async()=>{
 const user=userEvent.setup();mount();await screen.findByText('No accounting cutoff is closed.');const close=screen.getByRole('button',{name:'Close accounting period'});expect(close).toBeDisabled();await user.type(screen.getByLabelText('Close through'),'2026-10-31');await user.type(screen.getByLabelText('Period change reason'),'October books checked');await user.click(screen.getByLabelText('I reviewed the reports, GST and bank reconciliation'));await user.click(close);
 await waitFor(()=>expect(accountingPeriodsApi.close).toHaveBeenCalledWith({through:'2026-10-31',reason:'October books checked',reviewed:true,expectedRevision:0},'company'));await screen.findByText('Closed through 2026-10-31');expect(screen.getByText('October books checked')).toBeInTheDocument();
});
it('exposes no mutation action to a read-only role',async()=>{vi.mocked(accountingPeriodsApi.get).mockResolvedValue({...closed,canClose:false,canReopen:false});mount();await screen.findByText('Closed through 2026-10-31');expect(screen.queryByRole('button',{name:'Close accounting period'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Reopen accounting period'})).not.toBeInTheDocument();});
it('shows fetch failure and offers a real retry',async()=>{vi.mocked(accountingPeriodsApi.get).mockRejectedValueOnce(new Error('Offline'));mount();await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Retry period controls'})).toBeInTheDocument();});
