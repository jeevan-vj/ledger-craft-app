import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useQuotesQuery } from './useQuotes';

vi.mock('../api/quotesApi', () => ({
  quotesApi: {
    list: vi.fn().mockResolvedValue({
      quotes: [{ id: 'quote-1', quoteNumber: 'QUO-2026-0001', total: 115 }],
      counts: { draft: 1, sent: 0, viewed: 0, accepted: 0, declined: 0, expired: 0, converted: 0 },
    }),
  },
}));

describe('useQuotesQuery', () => {
  it('loads quotes from the Hono API client', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useQuotesQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.quotes[0]?.quoteNumber).toBe('QUO-2026-0001');
  });
});
