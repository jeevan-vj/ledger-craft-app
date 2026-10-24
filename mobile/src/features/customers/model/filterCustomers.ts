import type { Customer } from '@/services/customerService';

export function filterCustomers(customers: Customer[], query: string): Customer[] {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return customers;
  return customers.filter(customer =>
    [customer.name, customer.email, customer.phone].some(value =>
      value?.toLocaleLowerCase().includes(search),
    ),
  );
}
