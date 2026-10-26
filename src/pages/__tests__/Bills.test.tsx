import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Bills from '../Bills';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';

const { hasPermission } = vi.hoisted(() => ({
  hasPermission: vi.fn((permission: string) => permission === 'invoices:import'),
}));

vi.mock('@/features/purchases/api/purchasesApi', () => ({ purchasesApi: { listBills: vi.fn() } }));
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
