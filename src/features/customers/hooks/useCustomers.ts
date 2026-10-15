import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCustomerRequest, UpdateCustomerRequest } from '@ledgercraft/contracts';
import { customersApi, customersApiEnabled } from '../api/customersApi';

export const customersQueryKey = ['customers'] as const;

export function useCustomersQuery() {
  return useQuery({
    queryKey: customersQueryKey,
    queryFn: () => customersApi.list(),
    enabled: customersApiEnabled(),
  });
}

export function useCreateCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerRequest) => customersApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersQueryKey }),
  });
}

export function useUpdateCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerRequest }) =>
      customersApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersQueryKey }),
  });
}

export function useDeleteCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customersQueryKey }),
  });
}
