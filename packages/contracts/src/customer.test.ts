import { describe, expect, it } from 'vitest';
import { createCustomerRequestSchema, customerListResponseSchema, customerSchema } from './customer';

describe('customer contracts', () => {
  const customer = {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'A Ltd',
    email: 'a@example.com',
    address: null,
    city: null,
    state: null,
    zip: null,
    country: 'NZ',
    phone: null,
    isVip: false,
    tags: [],
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  };

  it('accepts a camelCase customer DTO without ownership ids', () => {
    expect(customerSchema.parse(customer)).toEqual(customer);
  });

  it('rejects a drizzle-shaped row', () => {
    const result = customerSchema.safeParse({
      id: customer.id,
      organisation_id: '11111111-1111-1111-1111-111111111111',
      user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'A Ltd',
      email: 'a@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects ownership ids on create', () => {
    const result = createCustomerRequestSchema.safeParse({
      name: 'A Ltd',
      email: 'a@example.com',
      organisationId: '11111111-1111-1111-1111-111111111111',
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a list envelope', () => {
    expect(customerListResponseSchema.parse({ customers: [customer] })).toEqual({
      customers: [customer],
    });
  });
});
