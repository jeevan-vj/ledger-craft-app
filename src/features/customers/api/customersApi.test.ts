import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customersApi } from './customersApi';

const dto = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Acme Ltd',
  email: 'acme@example.com',
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

describe('customersApi', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ customers: [dto] }),
      }),
    );
  });

  it('lists customers from /api/customers with credentials', async () => {
    const customers = await customersApi.list();
    expect(customers[0].name).toBe('Acme Ltd');
    expect(fetch).toHaveBeenCalledWith(
      '/api/customers',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
