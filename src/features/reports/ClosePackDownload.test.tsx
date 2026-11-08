import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ClosePackDownload } from './ClosePackDownload';
import { downloadClosePack } from './closePackDownload';
const access=vi.hoisted(()=>({permissions:['reports.read','banking.read']}));
vi.mock('@/context/StableAuthContext',()=>({useAuth:()=>({me:{permissions:access.permissions}})}));
vi.mock('./closePackDownload',()=>({downloadClosePack:vi.fn()}));
function mount(){render(<QueryClientProvider client={new QueryClient()}><ClosePackDownload from="2026-10-01" to="2026-10-31"/></QueryClientProvider>);}
beforeEach(()=>{vi.clearAllMocks();access.permissions=['reports.read','banking.read'];vi.mocked(downloadClosePack).mockResolvedValue(undefined);});
it('downloads one full-company pack for the applied dates',async()=>{const user=userEvent.setup();mount();await user.click(screen.getByRole('button',{name:'Download accountant close pack'}));await waitFor(()=>expect(downloadClosePack).toHaveBeenCalledWith('2026-10-01','2026-10-31'));await screen.findByRole('status');expect(screen.getByText(/full-company accrual/i)).toBeInTheDocument();});
it('does not offer bank evidence to a role without banking read access',()=>{access.permissions=['reports.read'];mount();expect(screen.queryByRole('button')).not.toBeInTheDocument();});
it('shows the real download failure and allows retry',async()=>{vi.mocked(downloadClosePack).mockRejectedValueOnce(new Error('Network unavailable'));const user=userEvent.setup();mount();await user.click(screen.getByRole('button',{name:'Download accountant close pack'}));await screen.findByText('Network unavailable');expect(screen.getByRole('button',{name:'Download accountant close pack'})).toBeEnabled();});
