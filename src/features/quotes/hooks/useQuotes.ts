import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { quotesApi } from '../api/quotesApi';

export const quoteQueryKeys = {
  all: ['quotes'] as const,
  list: ['quotes', 'list'] as const,
  detail: (id: string) => ['quotes', 'detail', id] as const,
};

export function useQuotesQuery() {
  return useQuery({
    queryKey: quoteQueryKeys.list,
    queryFn: () => quotesApi.list(),
  });
}

export function useQuoteQuery(id: string | undefined) {
  return useQuery({
    queryKey: quoteQueryKeys.detail(id ?? 'missing'),
    queryFn: () => quotesApi.get(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useRefreshQuotes() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: quoteQueryKeys.all }),
    [queryClient],
  );
}
