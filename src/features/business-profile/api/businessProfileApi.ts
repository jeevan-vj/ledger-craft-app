import type { BusinessProfileDto, UpsertBusinessProfileRequest } from '@ledgercraft/contracts';
import type { BusinessProfile } from '@/types';

export function businessProfileApiEnabled(): boolean {
  return import.meta.env.VITE_BUSINESS_API !== 'false';
}

export class BusinessProfileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BusinessProfileApiError';
  }
}

export function toProfile(dto: BusinessProfileDto): BusinessProfile {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    phone: dto.phone,
    address: dto.address,
    city: dto.city,
    state: dto.state,
    zip: dto.zip,
    country: dto.country,
    taxId: dto.taxId,
    logoUrl: dto.logoUrl,
    website: dto.website,
    defaultTaxRate: dto.defaultTaxRate == null ? null : Number(dto.defaultTaxRate),
    defaultTerms: dto.defaultTerms,
    defaultNotes: dto.defaultNotes,
    bankInfo: dto.bankInfo,
    bankAccountName: dto.bankAccountName,
    bankAccountNumber: dto.bankAccountNumber,
    theme: dto.theme,
    invoiceNumberFormat: dto.invoiceNumberFormat,
    invoiceNumberSequence: dto.invoiceNumberSequence,
    paymentTermDays: dto.paymentTermDays,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function money(value: number | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
}

export function toUpsertBusinessProfileRequest(
  profile: Omit<BusinessProfile, 'id' | 'createdAt' | 'updatedAt'> | BusinessProfile,
): UpsertBusinessProfileRequest {
  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? null,
    address: profile.address ?? null,
    city: profile.city ?? null,
    state: profile.state ?? null,
    zip: profile.zip ?? null,
    country: profile.country || 'NZ',
    taxId: profile.taxId ?? null,
    logoUrl: profile.logoUrl ?? null,
    website: profile.website ?? null,
    defaultTaxRate: money(profile.defaultTaxRate),
    defaultTerms: profile.defaultTerms ?? null,
    defaultNotes: profile.defaultNotes ?? null,
    bankInfo: profile.bankInfo ?? null,
    bankAccountName: profile.bankAccountName ?? null,
    bankAccountNumber: profile.bankAccountNumber ?? null,
    theme: profile.theme ?? null,
    invoiceNumberFormat: profile.invoiceNumberFormat ?? null,
    invoiceNumberSequence: profile.invoiceNumberSequence ?? undefined,
    paymentTermDays: profile.paymentTermDays ?? 30,
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
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
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    throw new BusinessProfileApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}

export const businessProfileApi = {
  async get(): Promise<BusinessProfile | null> {
    try {
      return toProfile(await request<BusinessProfileDto>('/api/business-profile'));
    } catch (error) {
      if (error instanceof BusinessProfileApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async upsert(
    profile: Omit<BusinessProfile, 'id' | 'createdAt' | 'updatedAt'> | BusinessProfile,
  ): Promise<BusinessProfile> {
    const dto = await request<BusinessProfileDto>('/api/business-profile', {
      method: 'PUT',
      body: JSON.stringify(toUpsertBusinessProfileRequest(profile)),
    });
    return toProfile(dto);
  },
};
