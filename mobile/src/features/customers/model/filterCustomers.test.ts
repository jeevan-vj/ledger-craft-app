import { filterCustomers } from './filterCustomers';
import type { Customer } from '@/services/customerService';

const customers = [
  { id: 'a', name: 'Acme Studio', email: 'billing@example.com', phone: '+64 21 123 456' },
  { id: 'b', name: 'No Contact', email: null, phone: null },
] as Customer[];

test('customer search matches name, email and phone without case or surrounding whitespace', () => {
  for (const query of [' ACME ', 'BILLING@', '123 456']) {
    expect(filterCustomers(customers, query).map(customer => customer.id)).toEqual(['a']);
  }
});

test('clearing search restores the list and missing contact details are safe', () => {
  expect(filterCustomers(customers, '   ')).toBe(customers);
  expect(filterCustomers(customers, 'no contact')).toEqual([customers[1]]);
  expect(filterCustomers(customers, 'missing')).toEqual([]);
});
