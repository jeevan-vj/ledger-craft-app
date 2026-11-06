import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Bills from '../Bills';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';

const { hasPermission } = vi.hoisted(() => ({
  hasPermission: vi.fn((permission: string) => permission === 'invoices:import'),
}));

vi.mock('@/features/purchases/api/purchasesApi', () => ({ purchasesApi: { listBills: vi.fn(), listBankAccounts: vi.fn(async () => [{ id: '11111111-1111-4111-8111-111111111111', accountName: 'NZD Operating', currency: 'NZD' }]), recordPayment: vi.fn(async () => ({})) } }));
vi.mock('@/context/StableAuthContext', () => ({ useAuth: () => ({ user: { id: 'bill-owner' } }) }));
vi.mock('@/features/organisations/api', () => ({ organisationsApi: { list: vi.fn(async () => ({ organisations: [{ id: 'company-1', isActive: true }] })) } }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission }),
}));

function renderBills() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Bills /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Bills page', () => {
  beforeEach(() => {
    localStorage.clear();
    hasPermission.mockReset();
    hasPermission.mockImplementation((permission: string) => permission === 'invoices:import');
    vi.mocked(purchasesApi.listBills).mockResolvedValue([]);
  });

  it('offers the primary bill action from the empty state', async () => {
    renderBills();
    expect(await screen.findByRole('heading', { name: 'Bills' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new bill/i }).length).toBeGreaterThan(0);
  });

  it('shows Import from file when invoices:import is permitted', async () => {
    renderBills();
    const link = await screen.findByRole('link', { name: /import from file/i });
    expect(link).toHaveAttribute('href', '/invoices/import?from=bills');
  });

  it('hides Import from file when invoices:import is not permitted', async () => {
    hasPermission.mockImplementation((permission: string) => permission !== 'invoices:import');
    renderBills();
    expect(await screen.findByRole('heading', { name: 'Bills' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /import from file/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new bill/i }).length).toBeGreaterThan(0);
  });
});

vi.mock('@/features/currency/api/currencyApi', () => ({ currencyApi: { get: vi.fn(async () => ({ rates: [{ id: '22222222-2222-4222-8222-222222222222', currencyCode: 'USD', baseCurrency: 'NZD', effectiveDate: '2026-01-01', rate: '1.65' }] })) } }));

it('requires a reviewed rate when paying a foreign bill from an NZD bank', async () => {
  const user = userEvent.setup();
  vi.mocked(purchasesApi.listBills).mockResolvedValue([{ id: 'bill', billNumber: 'BILL-USD', vendorName: 'Overseas supplier', balanceDue: '100.00', currency: 'USD', dueDate: '2026-11-30', displayStatus: 'received', lifecycleStatus: 'received', paymentStatus: 'unpaid', attachments: [], history: [] }] as never);
  renderBills();
  await user.click((await screen.findAllByRole('button', { name: 'Record payment' }))[0]);
  const dialog = screen.getByRole('dialog');
  const rate = await within(dialog).findByLabelText('Settlement exchange rate');
  await user.click(within(dialog).getByRole('combobox', { name: '' }));
  await user.click(await screen.findByRole('option', { name: 'NZD Operating' }));
  expect(within(dialog).getByRole('button', { name: 'Record 1 allocation' })).toBeDisabled();
  await user.selectOptions(rate, '22222222-2222-4222-8222-222222222222');
  await user.click(within(dialog).getByRole('button', { name: 'Record 1 allocation' }));
  await vi.waitFor(() => expect(purchasesApi.recordPayment).toHaveBeenCalledWith('bill', expect.objectContaining({ amount: '100.00', bankAccountId: '11111111-1111-4111-8111-111111111111', exchangeRateId: '22222222-2222-4222-8222-222222222222' }), expect.any(String)));
});

it('retries an uncertain supplier payment with the same exact body and key', async () => {
  const user = userEvent.setup();
  vi.mocked(purchasesApi.recordPayment).mockClear();
  vi.mocked(purchasesApi.recordPayment).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ payments: [], total: '69.00' } as never);
  vi.mocked(purchasesApi.listBills).mockResolvedValue([{ id: 'bill-retry', billNumber: 'BILL-RETRY', vendorName: 'Supplier', balanceDue: '69.00', currency: 'NZD', dueDate: '2026-11-30', displayStatus: 'received', lifecycleStatus: 'received', paymentStatus: 'unpaid', attachments: [], history: [] }] as never);
  const view = renderBills();
  await user.click((await screen.findAllByRole('button', { name: 'Record payment' }))[0]);
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('combobox', { name: '' }));
  await user.click(await screen.findByRole('option', { name: 'NZD Operating' }));
  await user.click(within(dialog).getByRole('button', { name: 'Record 1 allocation' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Connection lost');
  expect(within(dialog).getByLabelText('Amount')).toBeDisabled();
  expect(within(dialog).getByLabelText('Payment date')).toBeDisabled();
  view.unmount();
  renderBills();
  await user.click((await screen.findAllByRole('button', { name: 'Resume pending payment' }))[0]);
  const recoveredDialog = screen.getByRole('dialog');
  expect(within(recoveredDialog).getByLabelText('Amount')).toHaveValue('69.00');
  expect(within(recoveredDialog).getByLabelText('Amount')).toBeDisabled();
  await user.click(within(recoveredDialog).getByRole('button', { name: 'Retry same payment' }));
  await vi.waitFor(() => expect(purchasesApi.recordPayment).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(purchasesApi.recordPayment).mock.calls;
  expect(first[2]).toEqual(expect.any(String));
  expect(second).toEqual(first);
});

it('offers only active NZD settlement banks for a bill payment', async () => {
  const user = userEvent.setup();
  vi.mocked(purchasesApi.listBankAccounts).mockResolvedValueOnce([
    { id: '11111111-1111-4111-8111-111111111111', accountName: 'NZD Operating', currency: 'NZD', isActive: true },
    { id: '33333333-3333-4333-8333-333333333333', accountName: 'USD bank', currency: 'USD', isActive: true },
    { id: '44444444-4444-4444-8444-444444444444', accountName: 'Closed NZD bank', currency: 'NZD', isActive: false },
  ] as never);
  vi.mocked(purchasesApi.listBills).mockResolvedValue([{ id: 'bill-banks', billNumber: 'BILL-BANKS', vendorName: 'Supplier', balanceDue: '69.00', currency: 'NZD', dueDate: '2026-11-30', displayStatus: 'received', lifecycleStatus: 'received', paymentStatus: 'unpaid', attachments: [], history: [] }] as never);
  renderBills();
  await user.click((await screen.findAllByRole('button', { name: 'Record payment' }))[0]);
  await user.click(within(screen.getByRole('dialog')).getByRole('combobox', { name: '' }));
  expect(await screen.findByRole('option', { name: 'NZD Operating' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'USD bank' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Closed NZD bank' })).not.toBeInTheDocument();
});
