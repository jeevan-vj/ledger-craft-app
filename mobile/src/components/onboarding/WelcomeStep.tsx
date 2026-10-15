import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { OnboardingStepProps } from '@/types/onboarding';
import { getDefaultTaxRate } from '@/utils/countryTaxDefaults';
import CountryPicker from './CountryPicker';

export default function WelcomeStep({
  data,
  onDataChange,
  onNext,
  onSkip,
  isLoading,
}: OnboardingStepProps) {
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  const isValid = data.businessName.trim().length >= 2;

  const handleNext = () => {
    if (!isValid) {
      setNameError('Business name must be at least 2 characters');
      return;
    }
    onNext();
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>
          Business name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, nameError && styles.inputError]}
          placeholder="North Shore Studio"
          value={data.businessName}
          onChangeText={(text) => {
            onDataChange({ businessName: text });
            if (nameError) {
              setNameError(undefined);
            }
          }}
          placeholderTextColor="#94A3B8"
          testID="onboarding-business-name"
        />
        {nameError && <Text style={styles.errorText}>{nameError}</Text>}
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Country</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowCountryPicker(true)}
          activeOpacity={0.7}
          testID="onboarding-country"
        >
          <Text style={styles.pickerButtonText}>
            {data.country || 'Select your country'}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        {data.defaultTaxRate != null && (
          <Text style={styles.hint}>
            Default tax rate set to {data.defaultTaxRate}% for {data.country}.
          </Text>
        )}
      </View>

      {!!data.businessEmail && (
        <Text style={styles.hint}>Invoices will use {data.businessEmail}</Text>
      )}

      <TouchableOpacity
        style={[styles.continueButton, !isValid && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={!isValid || isLoading}
        activeOpacity={0.8}
        testID="onboarding-submit"
      >
        <Text style={styles.continueButtonText}>
          {isLoading ? 'Saving...' : 'Get started'}
        </Text>
      </TouchableOpacity>

      {onSkip && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={onSkip}
          disabled={isLoading}
          activeOpacity={0.7}
          testID="onboarding-skip"
        >
          <Text style={styles.skipButtonText}>I will do this later</Text>
        </TouchableOpacity>
      )}

      <CountryPicker
        visible={showCountryPicker}
        onSelect={(country) => {
          onDataChange({
            country,
            defaultTaxRate: getDefaultTaxRate(country),
          });
        }}
        onClose={() => setShowCountryPicker(false)}
        selectedCountry={data.country}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1E293B',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  pickerButton: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#1E293B',
  },
  chevron: {
    fontSize: 24,
    color: '#64748B',
    fontWeight: '300',
  },
  hint: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 18,
  },
  continueButton: {
    backgroundColor: '#163300',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  skipButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#64748B',
  },
});
