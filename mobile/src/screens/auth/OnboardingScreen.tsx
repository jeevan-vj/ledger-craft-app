import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { OnboardingData, DEFAULT_THEME } from '@/types/onboarding';
import { businessProfileService } from '@/services/businessProfileService';
import { useAuth } from '@/store';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  DEFAULT_ONBOARDING_COUNTRY,
  getDefaultTaxRate,
  stubBusinessName,
} from '@/utils/countryTaxDefaults';

export default function OnboardingScreen() {
  const { user, setOnboardingStatus } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    businessName: '',
    businessEmail: user?.email || '',
    country: DEFAULT_ONBOARDING_COUNTRY,
    invoiceNumberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
    defaultTaxRate: getDefaultTaxRate(DEFAULT_ONBOARDING_COUNTRY),
    address: '',
    city: '',
    state: '',
    zip: '',
    theme: DEFAULT_THEME,
    logoUri: undefined,
  });

  const updateData = (updates: Partial<OnboardingData>) => {
    setOnboardingData((prev) => ({ ...prev, ...updates }));
  };

  const completeOnboarding = async (data: OnboardingData) => {
    setIsLoading(true);
    try {
      await businessProfileService.createBusinessProfile({
        ...data,
        businessEmail: data.businessEmail || user?.email || '',
        defaultTaxRate: data.defaultTaxRate ?? getDefaultTaxRate(data.country),
        invoiceNumberFormat: data.invoiceNumberFormat || DEFAULT_INVOICE_NUMBER_FORMAT,
        theme: data.theme || DEFAULT_THEME,
      });

      setOnboardingStatus(true, true);
    } catch (error) {
      console.error('Error completing onboarding:', error);
      Alert.alert('Error', 'Failed to complete setup. Please try again.', [
        { text: 'OK' },
      ]);
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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.appTitle}>What is your business called?</Text>
          <Text style={styles.appSubtitle}>
            We will set GST, invoice numbers, and a default theme. You can
            change them later.
          </Text>
        </View>

        <View style={styles.contentCard}>
          <View style={styles.stepContent}>
            <WelcomeStep
              data={onboardingData}
              onDataChange={updateData}
              onNext={handleSubmit}
              onSkip={handleSkip}
              isLoading={isLoading}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  contentCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
