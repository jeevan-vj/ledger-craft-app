import { customerService } from '@/services/customerService';

const dto = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Acme Ltd',
  email: 'acme@example.com',
  address: '1 Queen St',
  city: 'Auckland',
  state: null,
  zip: '1010',
  country: 'NZ',
  phone: '+64 21 000 0000',
  isVip: false,
  tags: [],
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('CustomerService (Hono)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_CUSTOMERS_API = 'true';
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3001';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates a customer through /api/customers', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(dto, 201));

    const customer = await customerService.createCustomer({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      zip: dto.zip,
      country: dto.country,
    });

    expect(customer.name).toBe(dto.name);
    expect(customer.email).toBe(dto.email);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/customers',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lists customers through /api/customers', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({ customers: [dto] }));

    const customers = await customerService.fetchCustomers();

    expect(customers).toHaveLength(1);
    expect(customers[0].id).toBe(dto.id);
  });

  it('updates a customer through PATCH /api/customers/:id', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ ...dto, name: 'Updated Ltd' }),
    );

    const updated = await customerService.updateCustomer(dto.id, { name: 'Updated Ltd' });

    expect(updated.name).toBe('Updated Ltd');
    expect(global.fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:3001/api/customers/${dto.id}`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('deletes a customer through DELETE /api/customers/:id', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('no body');
      },
    });

    await expect(customerService.deleteCustomer(dto.id)).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      `http://127.0.0.1:3001/api/customers/${dto.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
