import { apiRequest } from '@/features/auth/api/http';

export interface MobileCustomerDto {
  id: string;
  name: string;
  email: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  phone: string | null;
  isVip: boolean | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export function customersApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_CUSTOMERS_API !== 'false';
}

export const customersApi = {
  async list(): Promise<MobileCustomerDto[]> {
    const body = await apiRequest<{ customers: MobileCustomerDto[] }>('/api/customers');
    return body.customers;
  },

  async get(id: string): Promise<MobileCustomerDto> {
    return apiRequest<MobileCustomerDto>(`/api/customers/${id}`);
  },

  async create(input: Record<string, unknown>): Promise<MobileCustomerDto> {
    return apiRequest<MobileCustomerDto>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async update(id: string, input: Record<string, unknown>): Promise<MobileCustomerDto> {
    return apiRequest<MobileCustomerDto>(`/api/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async remove(id: string): Promise<void> {
    await apiRequest<void>(`/api/customers/${id}`, { method: 'DELETE' });
  },
};
