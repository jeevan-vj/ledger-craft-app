import { OnboardingData, BusinessTheme, DEFAULT_THEME } from '@/types/onboarding';

export const mockBusinessTheme: BusinessTheme = DEFAULT_THEME;

export const mockOnboardingData: OnboardingData = {
  businessName: 'TEST_Acme Corporation',
  businessEmail: 'test@acmecorp.com',
  country: 'New Zealand',
  invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
  defaultTaxRate: 15,
  address: '123 Test Street',
  city: 'Auckland',
  state: 'Auckland',
  zip: '1010',
  theme: mockBusinessTheme,
  logoUri: undefined,
};

export const mockBusinessProfile = {
  id: 'test-profile-id',
  userId: 'test-user-id',
  businessName: mockOnboardingData.businessName,
  businessEmail: mockOnboardingData.businessEmail,
  country: mockOnboardingData.country,
  invoiceNumberFormat: mockOnboardingData.invoiceNumberFormat,
  invoiceNumberSequence: 0,
  defaultTaxRate: mockOnboardingData.defaultTaxRate,
  address: mockOnboardingData.address,
  city: mockOnboardingData.city,
  state: mockOnboardingData.state,
  zip: mockOnboardingData.zip,
  primaryColor: mockBusinessTheme.primary,
  secondaryColor: mockBusinessTheme.secondary,
  accentColor: mockBusinessTheme.accent,
  logoUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

