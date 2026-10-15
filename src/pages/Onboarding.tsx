import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { OnboardingData, DEFAULT_BUSINESS_THEME } from '../types';
import { useAuth } from '../context/StableAuthContext';
import { businessProfileService } from '../services/supabaseService';
import OnboardingLayout from '../components/onboarding/OnboardingLayout';
import WelcomeStep from '../components/onboarding/WelcomeStep';
import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  DEFAULT_ONBOARDING_COUNTRY,
  getDefaultTaxRate,
  stubBusinessName,
} from '@/utils/countryTaxDefaults';

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, markOnboardingComplete } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    businessName: '',
    businessEmail: user?.email || '',
    country: DEFAULT_ONBOARDING_COUNTRY,
    invoiceNumberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
    defaultTaxRate: getDefaultTaxRate(DEFAULT_ONBOARDING_COUNTRY),
    theme: DEFAULT_BUSINESS_THEME,
  });

  const updateData = (updates: Partial<OnboardingData>) => {
    setOnboardingData((prev) => ({ ...prev, ...updates }));
  };

  const completeOnboarding = async (data: OnboardingData) => {
    if (!user?.id) {
      toast({
        title: 'Authentication Error',
        description: 'Please try logging in again.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await businessProfileService.createOrUpdateBusinessProfile({
        name: data.businessName,
        email: data.businessEmail || user.email || '',
        country: data.country,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        defaultTaxRate: data.defaultTaxRate ?? getDefaultTaxRate(data.country) ?? null,
        invoiceNumberFormat: data.invoiceNumberFormat || DEFAULT_INVOICE_NUMBER_FORMAT,
        invoiceNumberSequence: 1,
        theme: data.theme || DEFAULT_BUSINESS_THEME,
        logoUrl: null,
        userId: user.id,
      });

      markOnboardingComplete();

      toast({
        title: 'You are in',
        description: 'Create your first invoice whenever you are ready.',
      });

      navigate('/', { replace: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      toast({
        title: 'Setup Failed',
        description: 'Failed to complete setup. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    void completeOnboarding(onboardingData);
  };

  const handleSkip = () => {
    void completeOnboarding({
      ...onboardingData,
      businessName: stubBusinessName(user),
      country: onboardingData.country || DEFAULT_ONBOARDING_COUNTRY,
      defaultTaxRate:
        onboardingData.defaultTaxRate ?? getDefaultTaxRate(DEFAULT_ONBOARDING_COUNTRY),
    });
  };

  return (
    <OnboardingLayout
      title="What is your business called?"
      subtitle="We will set GST, invoice numbers, and a default theme. You can change them later."
    >
      <WelcomeStep
        data={onboardingData}
        onDataChange={updateData}
        onNext={handleSubmit}
        onSkip={handleSkip}
        isLoading={isLoading}
      />
    </OnboardingLayout>
  );
}
