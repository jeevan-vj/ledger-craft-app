import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Bills from '../Bills';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';

vi.mock('@/features/purchases/api/purchasesApi', () => ({ purchasesApi: { listBills: vi.fn() } }));

describe('Bills page', () => {
  beforeEach(() => vi.mocked(purchasesApi.listBills).mockResolvedValue([]));
  it('offers the primary bill action from the empty state', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><Bills /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Bills' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new bill/i }).length).toBeGreaterThan(0);
  });
});
