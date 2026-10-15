import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCustomersQuery } from './useCustomers';

vi.mock('../api/customersApi', () => ({
  customersApiEnabled: () => true,
  customersApi: {
    list: vi.fn().mockResolvedValue([
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Acme Ltd',
        email: 'acme@example.com',
      },
    ]),
  },
}));

describe('useCustomersQuery', () => {
  it('loads customers from the Hono API client', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCustomersQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].name).toBe('Acme Ltd');
  });
});
