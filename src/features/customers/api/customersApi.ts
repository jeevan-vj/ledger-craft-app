import type { CreateCustomerRequest, CustomerDto, UpdateCustomerRequest } from '@ledgercraft/contracts';
import { presentResponseError } from '@/lib/apiErrorCopy';
import type { Customer } from '@/types';

export function customersApiEnabled(): boolean {
  return import.meta.env.VITE_CUSTOMERS_API !== 'false';
}

export function toCreateCustomerRequest(
  customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>,
): CreateCustomerRequest {
  return {
    name: customer.name,
    email: customer.email ?? '',
    address: customer.address ?? null,
    city: customer.city ?? null,
    state: customer.state ?? null,
    zip: customer.zip ?? null,
    country: customer.country || 'NZ',
    phone: customer.phone ?? null,
    isVip: customer.isVip ?? false,
    tags: customer.tags ?? [],
  };
}

export function toUpdateCustomerRequest(
  customer: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>,
): UpdateCustomerRequest {
  const input: UpdateCustomerRequest = {};
  if (customer.name !== undefined) input.name = customer.name;
  if (customer.email !== undefined) input.email = customer.email ?? '';
  if (customer.address !== undefined) input.address = customer.address ?? null;
  if (customer.city !== undefined) input.city = customer.city ?? null;
  if (customer.state !== undefined) input.state = customer.state ?? null;
  if (customer.zip !== undefined) input.zip = customer.zip ?? null;
  if (customer.country !== undefined) input.country = customer.country;
  if (customer.phone !== undefined) input.phone = customer.phone ?? null;
  if (customer.isVip !== undefined) input.isVip = customer.isVip ?? null;
  if (customer.tags !== undefined) input.tags = customer.tags ?? null;
  return input;
}

export class CustomersApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CustomersApiError';
  }
}

function toCustomer(dto: CustomerDto): Customer {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    address: dto.address,
    city: dto.city,
    state: dto.state,
    zip: dto.zip,
    country: dto.country,
    phone: dto.phone,
    isVip: dto.isVip,
    tags: dto.tags,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

async function parseError(response: Response): Promise<string> {
  return (await presentResponseError(response)).message;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  if (!response.ok) {
    throw new CustomersApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}

export const customersApi = {
  async list(): Promise<Customer[]> {
    const body = await request<{ customers: CustomerDto[] }>('/api/customers');
    return body.customers.map(toCustomer);
  },

  async get(id: string): Promise<Customer | null> {
    try {
      const dto = await request<CustomerDto>(`/api/customers/${id}`);
      return toCustomer(dto);
    } catch (error) {
      if (error instanceof CustomersApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async create(input: CreateCustomerRequest): Promise<Customer> {
    const dto = await request<CustomerDto>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return toCustomer(dto);
  },

  async update(id: string, input: UpdateCustomerRequest): Promise<Customer> {
    const dto = await request<CustomerDto>(`/api/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return toCustomer(dto);
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/api/customers/${id}`, { method: 'DELETE' });
  },
};
