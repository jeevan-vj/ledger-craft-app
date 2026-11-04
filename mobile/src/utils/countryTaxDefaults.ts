export const DEFAULT_INVOICE_NUMBER_FORMAT = 'INV-{YYYY}-{SEQ}';
export const DEFAULT_ONBOARDING_COUNTRY = 'New Zealand';

const COUNTRY_TAX_RATES: Record<string, number> = {
  'New Zealand': 15,
  Australia: 10,
  'United Kingdom': 20,
};

const COUNTRY_CURRENCIES: Record<string, string> = {
  'New Zealand': 'NZD',
  Australia: 'AUD',
  'United States': 'USD',
  'United Kingdom': 'GBP',
  Canada: 'CAD',
  Germany: 'EUR',
  France: 'EUR',
  Japan: 'JPY',
  Singapore: 'SGD',
  India: 'INR',
  China: 'CNY',
  Brazil: 'BRL',
  Mexico: 'MXN',
  'South Africa': 'ZAR',
  Netherlands: 'EUR',
  Spain: 'EUR',
  Italy: 'EUR',
  Sweden: 'SEK',
  Norway: 'NOK',
  Denmark: 'DKK',
  'Sri Lanka': 'LKR',
  Pakistan: 'PKR',
  Bangladesh: 'BDT',
  Malaysia: 'MYR',
  Indonesia: 'IDR',
  Thailand: 'THB',
  Philippines: 'PHP',
  Vietnam: 'VND',
  'South Korea': 'KRW',
  'United Arab Emirates': 'AED',
  'Saudi Arabia': 'SAR',
  Egypt: 'EGP',
  Nigeria: 'NGN',
  Kenya: 'KES',
  Argentina: 'ARS',
  Chile: 'CLP',
  Colombia: 'COP',
  Poland: 'PLN',
  Switzerland: 'CHF',
  Austria: 'EUR',
  Belgium: 'EUR',
  Ireland: 'EUR',
  Portugal: 'EUR',
  Greece: 'EUR',
  Turkey: 'TRY',
  Russia: 'RUB',
  Ukraine: 'UAH',
  Israel: 'ILS',
};

export function getDefaultTaxRate(country: string): number | undefined {
  return COUNTRY_TAX_RATES[country];
}

export function currencyForCountry(country: string | null | undefined): string {
  const name = country?.trim();
  if (!name || name === 'Other') return 'NZD';
  return COUNTRY_CURRENCIES[name] ?? 'NZD';
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
