import { useState, useEffect } from 'react';
import { Customer } from '@/types';
import { customerService } from '@/services/supabaseService';

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const data = await customerService.getCustomers();
      setCustomers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch customers'));
    } finally {
      setIsLoading(false);
    }
  };

  const createCustomer = async (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      setIsLoading(true);
      const newCustomer = await customerService.createCustomer(customer);
      setCustomers(prev => [...prev, newCustomer]);
      setError(null);
      return newCustomer;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create customer'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateCustomer = async (id: string, customer: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      setIsLoading(true);
      const updatedCustomer = await customerService.updateCustomer(id, customer);
      setCustomers(prev => prev.map(c => c.id === id ? updatedCustomer : c));
      setError(null);
      return updatedCustomer;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update customer'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      setIsLoading(true);
      await customerService.deleteCustomer(id);
      setCustomers(prev => prev.filter(c => c.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete customer'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    customers,
    isLoading,
    error,
    fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  };
} 