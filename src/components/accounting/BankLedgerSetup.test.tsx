import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach,expect,it,vi } from 'vitest';
import { BankLedgerSetup } from './BankLedgerSetup';
import { bankLedgerApi } from '@/features/accounting-completion/bankLedgerApi';
const access=vi.hoisted(()=>({permissions:['banking.write']}));
vi.mock('@/context/StableAuthContext',()=>({useAuth:()=>({me:{organisation:{id:'company'},permissions:access.permissions}})}));
vi.mock('@/features/accounting-completion/bankLedgerApi',()=>({bankLedgerApi:{banks:vi.fn(),prepare:vi.fn()}}));
const changed=vi.fn();
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BankLedgerSetup onPrepared={changed}/></QueryClientProvider>);}
beforeEach(()=>{vi.clearAllMocks();access.permissions=['banking.write'];vi.mocked(bankLedgerApi.banks).mockResolvedValue([{id:'bank',accountName:'Operating',currency:'NZD',isActive:true}] as never);vi.mocked(bankLedgerApi.prepare).mockResolvedValue({id:'ledger',name:'Operating'} as never);});
it('links the selected bank through the server without asking users for internal codes or opening money',async()=>{const user=userEvent.setup();mount();await screen.findByRole('option',{name:'Operating'});await user.selectOptions(screen.getByRole('combobox',{name:'Business bank'}),'bank');await user.click(screen.getByRole('button',{name:'Prepare bank ledger'}));await waitFor(()=>expect(bankLedgerApi.prepare).toHaveBeenCalledWith('bank','company'));await screen.findByRole('status');expect(changed).toHaveBeenCalled();expect(screen.queryByLabelText('Account code')).not.toBeInTheDocument();});
it('keeps bank setup unavailable without write permission',()=>{access.permissions=[];mount();expect(screen.queryByRole('button')).not.toBeInTheDocument();});
it('allows retry when bank loading fails',async()=>{vi.mocked(bankLedgerApi.banks).mockRejectedValueOnce(new Error('Offline'));mount();await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Retry bank ledger setup'})).toBeInTheDocument();});
