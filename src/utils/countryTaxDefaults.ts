export const DEFAULT_INVOICE_NUMBER_FORMAT = 'INV-{YYYY}-{SEQ}';
export const DEFAULT_ONBOARDING_COUNTRY = 'New Zealand';

const COUNTRY_TAX_RATES: Record<string, number> = {
  'New Zealand': 15,
  Australia: 10,
  'United Kingdom': 20,
};

export function getDefaultTaxRate(country: string): number | undefined {
  return COUNTRY_TAX_RATES[country];
}

export function stubBusinessName(user?: {
  email?: string | null;
  user_metadata?: { full_name?: string };
} | null): string {
  const fullName = user?.user_metadata?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  const localPart = user?.email?.split('@')[0]?.trim();
  if (localPart) {
    return localPart;
  }

  return 'My Business';
}
