import { apiRequest, AuthApiError } from '@/features/auth/api/http';
import type { BusinessProfile } from '@/services/businessProfileService';
import type { BusinessTheme } from '@/types/onboarding';

export interface MobileBusinessProfileDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  taxId: string | null;
  logoUrl: string | null;
  website: string | null;
  defaultTaxRate: string | null;
  defaultTerms: string | null;
  paymentTermDays: number;
  defaultNotes: string | null;
  bankInfo: string | null;
  theme: BusinessTheme | null;
  invoiceNumberFormat: string | null;
  invoiceNumberSequence: number | null;
  createdAt: string;
  updatedAt: string;
}

export function businessProfileApiEnabled(): boolean {
  return process.env.EXPO_PUBLIC_BUSINESS_API !== 'false';
}

export function toBusinessProfile(dto: MobileBusinessProfileDto): BusinessProfile {
  return {
    id: dto.id,
    userId: '',
    name: dto.name,
    email: dto.email,
    country: dto.country,
    invoiceNumberFormat: dto.invoiceNumberFormat ?? 'INV-{YYYY}-{SEQ}',
    invoiceNumberSequence: dto.invoiceNumberSequence ?? 1,
    defaultTaxRate: dto.defaultTaxRate == null ? undefined : Number(dto.defaultTaxRate),
    address: dto.address ?? undefined,
    city: dto.city ?? undefined,
    state: dto.state ?? undefined,
    zip: dto.zip ?? undefined,
    phone: dto.phone ?? undefined,
    taxId: dto.taxId ?? undefined,
    website: dto.website ?? undefined,
    defaultTerms: dto.defaultTerms ?? undefined,
    defaultNotes: dto.defaultNotes ?? undefined,
    bankInfo: dto.bankInfo ?? undefined,
    logoUrl: dto.logoUrl ?? undefined,
    theme: dto.theme ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function money(value: number | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
}

export const businessProfileApi = {
  async get(): Promise<BusinessProfile | null> {
    try {
      return toBusinessProfile(await apiRequest<MobileBusinessProfileDto>('/api/business-profile'));
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async upsert(input: Record<string, unknown>): Promise<BusinessProfile> {
    const dto = await apiRequest<MobileBusinessProfileDto>('/api/business-profile', {
      method: 'PUT',
      body: JSON.stringify({
        ...input,
        defaultTaxRate: money(input.defaultTaxRate as number | string | null | undefined),
      }),
    });
    return toBusinessProfile(dto);
  },
};
