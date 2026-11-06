import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AccountsPage from '../Accounts';
import { reportsApi } from '@/features/reports/api/reportsApi';
import { accountsApi } from '@/features/payments/api/paymentsApi';

const { createAccount, updateAccount, accountFixture } = vi.hoisted(() => ({ createAccount: vi.fn(), updateAccount: vi.fn(), accountFixture: { name: 'Sales Revenue', type: 'custom', currency: 'NZD', accountClass: 'revenue' } }));
vi.mock('@/hooks/useAppData', () => ({ useAppData: () => ({
  accounts: [{ id: 'sales', ...accountFixture, openingBalance: 0, currentBalance: 0 }],
  businessProfile: { currency: 'NZD' }, isLoadingAccounts: false,
  createAccount, updateAccount, deleteAccount: vi.fn(), refreshAccounts: vi.fn(),
}) }));
vi.mock('@/features/reports/api/reportsApi', () => ({ reportsApi: { financial: vi.fn() } }));
vi.mock('@/features/payments/api/paymentsApi', () => ({ accountsApi: { create: vi.fn(), update: vi.fn() } }));
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}><MemoryRouter><AccountsPage /></MemoryRouter></QueryClientProvider>);
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(accountFixture, { name: 'Sales Revenue', type: 'custom', currency: 'NZD', accountClass: 'revenue' });
  vi.mocked(reportsApi.financial).mockResolvedValue({ trialBalance: { rows: [{ accountId: 'sales', balance: '1400.00' }] } } as never);
});

it('shows posted ledger balances instead of stale account snapshots', async () => {
  mount();
  const row = screen.getByText('Sales Revenue').closest('tr')!;
  expect(await within(row).findByText('1,400.00')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Posted ledger balance (NZD)' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Current Balance' })).not.toBeInTheDocument();
});

it('shows an unavailable balance rather than pretending a failed ledger load is zero', async () => {
  vi.mocked(reportsApi.financial).mockRejectedValue(new Error('offline'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Posted balances could not be loaded');
  expect(within(screen.getByText('Sales Revenue').closest('tr')!).getByText('Unavailable')).toBeInTheDocument();
});

it('defaults a new NZ business account to NZD and does not offer an editable posted balance', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Add Account' }));
  expect(screen.getByLabelText('Currency')).toHaveValue('NZD');
  expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Current Balance')).not.toBeInTheDocument();
});

it('saves an account through Hono instead of missing facade mutation methods', async () => {
  vi.mocked(accountsApi.create).mockResolvedValue({ id: 'created' } as never);
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Add Account' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Owner capital' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(accountsApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Owner capital', currency: 'NZD' })));
  expect(createAccount).not.toHaveBeenCalled();
  expect(accountsApi.create).toHaveBeenCalledWith(expect.not.objectContaining({ currentBalance: expect.anything() }));
});

it('updates account details without overwriting its posted balance', async () => {
  vi.mocked(accountsApi.update).mockResolvedValue({ id: 'sales' } as never);
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Consulting revenue' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(accountsApi.update).toHaveBeenCalledWith('sales', expect.objectContaining({ name: 'Consulting revenue', accountClass: 'revenue' })));
  expect(accountsApi.update).toHaveBeenCalledWith('sales', expect.not.objectContaining({ currentBalance: expect.anything() }));
});

it('deactivates an account without deleting its historical ledger', async () => {
  vi.mocked(accountsApi.update).mockResolvedValue({ id: 'sales', isActive: false } as never);
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
  await vi.waitFor(() => expect(accountsApi.update).toHaveBeenCalledWith('sales', { isActive: false }));
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
});

it('exposes guided opening balances and historical ledger audit from Accounts', async () => {
  mount();
  expect(screen.getByText('Opening balances and historical corrections')).toBeInTheDocument();
});

it('shows the authoritative NZD ledger balance even when account metadata is USD', async () => {
  Object.assign(accountFixture, { name: 'Foreign bank', type: 'bank', currency: 'USD', accountClass: 'asset' });
  vi.mocked(reportsApi.financial).mockResolvedValue({ trialBalance: { rows: [{ accountId: 'sales', balance: '160.00' }] } } as never);
  mount();
  const row = screen.getByText('Foreign bank').closest('tr')!;
  expect(await within(row).findByText('160.00')).toBeInTheDocument();
  expect(within(row).getByText('USD')).toBeInTheDocument();
  expect(within(row).queryByText('NZD reports only')).not.toBeInTheDocument();
});
