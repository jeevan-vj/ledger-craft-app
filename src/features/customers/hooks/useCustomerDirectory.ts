import { customersApiEnabled, toCreateCustomerRequest, toUpdateCustomerRequest } from '../api/customersApi';
import { useAppData } from '@/hooks/useAppData';
import type { Customer } from '@/types';
import {
  useCreateCustomerMutation,
  useCustomersQuery,
  useDeleteCustomerMutation,
  useUpdateCustomerMutation,
} from './useCustomers';

export function useCustomerDirectory() {
  const appData = useAppData();
  const query = useCustomersQuery();
  const createMutation = useCreateCustomerMutation();
  const updateMutation = useUpdateCustomerMutation();
  const deleteMutation = useDeleteCustomerMutation();

  if (!customersApiEnabled()) {
    return {
      customers: appData.customers,
      isLoadingCustomers: appData.isLoadingCustomers,
      refreshCustomers: appData.refreshCustomers,
      createCustomer: appData.createCustomer,
      updateCustomer: appData.updateCustomer,
      deleteCustomer: appData.deleteCustomer,
    };
  }

  return {
    customers: query.data ?? [],
    isLoadingCustomers: query.isLoading,
    refreshCustomers: async () => {
      await query.refetch();
    },
    createCustomer: async (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => {
      return createMutation.mutateAsync(toCreateCustomerRequest(customer));
    },
    updateCustomer: async (
      id: string,
      customer: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>,
    ) => {
      return updateMutation.mutateAsync({
        id,
        input: toUpdateCustomerRequest(customer),
      });
    },
    deleteCustomer: async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
  };
}
