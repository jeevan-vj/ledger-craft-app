import { businessProfileService } from '@/services/businessProfileService';
import { getAuthenticatedSupabaseClient, cleanupTestData, TEST_USER } from '@/__tests__/setup/testEnv';
import { mockOnboardingData, mockBusinessTheme } from '@/__tests__/fixtures/onboarding.fixtures';

describe('BusinessProfileService', () => {
  let supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>;

  beforeAll(async () => {
    process.env.EXPO_PUBLIC_BUSINESS_API = 'false';
    supabase = await getAuthenticatedSupabaseClient();
  });

  afterEach(async () => {
    // Clean up test business profile
    if (TEST_USER.userId) {
      await cleanupTestData.deleteBusinessProfile(supabase, TEST_USER.userId);
    }
  });

  describe('createBusinessProfile', () => {
    it('should create a business profile with valid data', async () => {
      const testData = {
        ...mockOnboardingData,
        businessName: `TEST_${Date.now()}_Business`,
        logoUri: undefined, // No logo for this test
      };

      const profile = await businessProfileService.createBusinessProfile(testData);

      expect(profile).toBeDefined();
      expect(profile.businessName).toBe(testData.businessName);
      expect(profile.businessEmail).toBe(testData.businessEmail);
      expect(profile.country).toBe(testData.country);
      expect(profile.invoiceNumberFormat).toBe(testData.invoiceNumberFormat);
      expect(profile.defaultTaxRate).toBe(testData.defaultTaxRate);
    });

    it('should handle logo upload failure gracefully', async () => {
      const testData = {
        ...mockOnboardingData,
        businessName: `TEST_${Date.now()}_LogoFail`,
        logoUri: 'file:///non-existent-image.jpg',
      };

      // Should not throw error, logo upload failure is optional
      const profile = await businessProfileService.createBusinessProfile(testData);

      expect(profile).toBeDefined();
      expect(profile.businessName).toBe(testData.businessName);
      expect(profile.logoUrl).toBeNull(); // Logo should be null on failure
    });

    it('should store theme colors correctly', async () => {
      const testData = {
        ...mockOnboardingData,
        businessName: `TEST_${Date.now()}_Theme`,
        theme: mockBusinessTheme,
      };

      const profile = await businessProfileService.createBusinessProfile(testData);

      expect(profile).toBeDefined();
      expect(profile.primaryColor).toBe(mockBusinessTheme.primary);
      expect(profile.secondaryColor).toBe(mockBusinessTheme.secondary);
      expect(profile.accentColor).toBe(mockBusinessTheme.accent);
    });
  });

  describe('getBusinessProfile', () => {
    it('should return business profile for authenticated user', async () => {
      // First create a profile
      const testData = {
        ...mockOnboardingData,
        businessName: `TEST_${Date.now()}_GetProfile`,
      };
      await businessProfileService.createBusinessProfile(testData);

      // Then retrieve it
      const profile = await businessProfileService.getBusinessProfile();

      expect(profile).toBeDefined();
      expect(profile).not.toBeNull();
      expect(profile?.businessName).toBe(testData.businessName);
    });

    it('should return null if no profile exists', async () => {
      // Ensure no profile exists
      const profile = await businessProfileService.getBusinessProfile();

      // Should return null for user without profile
      expect(profile).toBeNull();
    });
  });

  describe('uploadLogo', () => {
    it('should return null when bucket does not exist', async () => {
      const testUri = 'file:///test-image.jpg';
      
      const result = await businessProfileService.uploadLogo(testUri, TEST_USER.userId);

      // Should gracefully return null instead of throwing
      expect(result).toBeNull();
    });
  });
});

