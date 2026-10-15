import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useInvoicesQuery } from '@/features/app-data/useLedgerQueries';

vi.mock('@/features/ledger/api/ledgerSnapshot', () => ({
  honoAppDataEnabled: () => true,
}));

vi.mock('@/features/invoices/api/invoicesApi', () => ({
  invoicesApiEnabled: () => true,
  invoicesApi: {
    list: vi.fn().mockResolvedValue([
      {
        id: '22222222-2222-2222-2222-222222222222',
        invoiceNumber: 'INV-2026-001',
        total: 120,
      },
    ]),
  },
}));

describe('useInvoicesQuery', () => {
  it('loads invoices from the Hono API client', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useInvoicesQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].invoiceNumber).toBe('INV-2026-001');
  });
});
