import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Vendors from '../Vendors';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';

vi.mock('@/features/purchases/api/purchasesApi', () => ({
  purchasesApi: {
    listVendors: vi.fn(),
    createVendor: vi.fn(),
    updateVendor: vi.fn(),
    removeVendor: vi.fn(),
    listAccounts: vi.fn(),
    exportVendors: vi.fn(),
    importVendors: vi.fn(),
  },
}));

describe('Vendors page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(purchasesApi.listVendors).mockResolvedValue([]);
    vi.mocked(purchasesApi.listAccounts).mockResolvedValue([]);
  });

  it('shows the current design-system empty state and vendor form', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><Vendors /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Vendors' })).toBeInTheDocument();
    expect(await screen.findByText(/add suppliers before recording bills/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /new vendor/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Vendor name')).toBeInTheDocument();
    expect(screen.getByLabelText('Contact person')).toBeInTheDocument();
    expect(screen.getByLabelText('Active vendor')).toBeChecked();
  });
});
