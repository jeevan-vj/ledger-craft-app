import type { BusinessTheme } from '@/features/business-profile/theme';

export type { BusinessTheme };

export interface OnboardingData {
  businessName: string;
  businessEmail: string;
  country: string;
  invoiceNumberFormat: string;
  defaultTaxRate?: number;
  gstRegistrationStatus: 'unknown' | 'registered' | 'not_registered';
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  theme: BusinessTheme;
  logoUri?: string;
}

export interface OnboardingStepProps {
  data: OnboardingData;
  onDataChange: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onSkip?: () => void;
  isLoading?: boolean;
}

export { DEFAULT_THEME, PRESET_THEMES } from '@/features/business-profile/theme';

export const INVOICE_FORMATS = [
  {
    value: 'INV-{YYYY}-{SEQ}',
    label: 'INV-2025-0001',
    description: 'Year with sequence',
  },
];

export const COUNTRIES = [
  'New Zealand',
  'Australia',
  'United States',
  'United Kingdom',
  'Canada',
  'Germany',
  'France',
  'Japan',
  'Singapore',
  'India',
  'China',
  'Brazil',
  'Mexico',
  'South Africa',
  'Netherlands',
  'Spain',
  'Italy',
  'Sweden',
  'Norway',
  'Denmark',
  'Sri Lanka',
  'Pakistan',
  'Bangladesh',
  'Malaysia',
  'Indonesia',
  'Thailand',
  'Philippines',
  'Vietnam',
  'South Korea',
  'United Arab Emirates',
  'Saudi Arabia',
  'Egypt',
  'Nigeria',
  'Kenya',
  'Argentina',
  'Chile',
  'Colombia',
  'Poland',
  'Switzerland',
  'Austria',
  'Belgium',
  'Ireland',
  'Portugal',
  'Greece',
  'Turkey',
  'Russia',
  'Ukraine',
  'Israel',
  'Other',
];
