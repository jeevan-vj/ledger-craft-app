import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import CountryPicker from '@/components/onboarding/CountryPicker';
import { businessProfileService } from '@/services/businessProfileService';
import { useAuth } from '@/store';
import { DEFAULT_THEME, type OnboardingData } from '@/types/onboarding';
import {
  DEFAULT_INVOICE_NUMBER_FORMAT,
  DEFAULT_ONBOARDING_COUNTRY,
} from '@/utils/countryTaxDefaults';
import {
  businessTaxDefaults,
  type GstRegistrationStatus,
} from '@/features/onboarding/onboardingModel';
import { setupFailureAlert } from '@/features/onboarding/setupFailure';
import { onboardingStorage } from '@/features/onboarding/onboardingStorage';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { selectionHaptic } from '@/utils/haptics';

const stepCopy = [
  { title: 'What is your business called?', body: 'This name appears on invoices, reports, and business records.' },
  { title: 'Where is your business based?', body: 'We use your country to suggest relevant tax settings. You can change it later.' },
  { title: 'Are you registered for GST?', body: 'Choose the option that reflects your business today.' },
] as const;

export default function OnboardingScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user, setOnboardingStatus } = useAuth();
  const [step, setStep] = useState(0);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<OnboardingData>({
    businessName: '',
    businessEmail: user?.email || '',
    phone: '',
    country: DEFAULT_ONBOARDING_COUNTRY,
    invoiceNumberFormat: DEFAULT_INVOICE_NUMBER_FORMAT,
    defaultTaxRate: 0,
    gstRegistrationStatus: 'unknown',
    theme: DEFAULT_THEME,
  });

  useEffect(() => {
    Promise.all([
      onboardingStorage.loadAccountDraft(),
      onboardingStorage.loadBusinessDraft(),
    ]).then(([account, business]) => {
      setData((current) => ({
        ...current,
        businessEmail: account?.email || current.businessEmail,
        phone: account?.phone || current.phone,
        businessName: business?.businessName || current.businessName,
        country: business?.country || current.country,
        gstRegistrationStatus: business?.gstRegistrationStatus || current.gstRegistrationStatus,
      }));
      if (business) setStep(Math.max(0, Math.min(2, business.step)));
    }).catch(() => undefined);
  }, []);

  const update = (changes: Partial<OnboardingData>) => {
    setData((current) => ({ ...current, ...changes }));
    setError(undefined);
  };

  const saveDraft = async (nextStep: number) => {
    await onboardingStorage.saveBusinessDraft({
      step: nextStep,
      businessName: data.businessName,
      country: data.country,
      gstRegistrationStatus: data.gstRegistrationStatus,
    }).catch(() => undefined);
  };

  const next = async () => {
    if (step === 0 && data.businessName.trim().length < 2) {
      setError('Enter a business name with at least 2 characters.');
      return;
    }
    if (step === 1 && !data.country) {
      setError('Choose your business country.');
      return;
    }
    if (step < 2) {
      await saveDraft(step + 1);
      setStep((current) => current + 1);
      return;
    }
    if (data.gstRegistrationStatus === 'unknown') {
      setError('Choose whether your business is registered for GST.');
      return;
    }

    const tax = businessTaxDefaults(data.country, data.gstRegistrationStatus);
    setIsLoading(true);
    try {
      await businessProfileService.createBusinessProfile({
        ...data,
        businessName: data.businessName.trim(),
        businessEmail: data.businessEmail || user?.email || '',
        phone: data.phone?.trim() || undefined,
        ...tax,
      });
      await Promise.all([
        onboardingStorage.clearAccountDraft(),
        onboardingStorage.clearBusinessDraft(),
      ]).catch(() => undefined);
      setOnboardingStatus(true, true);
    } catch (caught) {
      console.error('Error completing onboarding:', caught);
      const failure = setupFailureAlert(caught);
      setError(failure.message);
      Alert.alert(failure.title, failure.message);
    } finally {
      setIsLoading(false);
    }
  };

  const back = () => {
    if (step === 0) return;
    const nextStep = step - 1;
    setError(undefined);
    setStep(nextStep);
    void saveDraft(nextStep);
  };

  const selectGst = (status: GstRegistrationStatus) => {
    if (status !== data.gstRegistrationStatus) selectionHaptic();
    update({ gstRegistrationStatus: status });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable onPress={back} disabled={step === 0} style={[styles.back, step === 0 && styles.backHidden]}
            accessibilityRole="button" accessibilityLabel="Previous step" accessibilityState={{ disabled: step === 0 }}>
            <Feather name="arrow-left" size={22} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Your business</Text>
          <Text style={styles.stepCount}>{step + 1}/{stepCopy.length}</Text>
        </View>
        <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${stepCopy.length}`}>
          {stepCopy.map((item, index) => (
            <View key={item.title} style={[styles.progressTrack, index <= step && styles.progressTrackActive]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
          <Animated.View key={step} entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}>
            <Text style={styles.title}>{stepCopy[step].title}</Text>
            <Text style={styles.subtitle}>{stepCopy[step].body}</Text>

          {step === 0 ? (
            <ModernInput label="Business name" value={data.businessName} onChangeText={(businessName) => update({ businessName })}
              placeholder="Kauri Studio Ltd" autoCapitalize="words" autoComplete="organization" returnKeyType="next"
              error={error} onSubmitEditing={() => void next()} autoFocus />
          ) : null}

          {step === 1 ? (
            <>
              <Pressable onPress={() => setShowCountryPicker(true)} accessibilityRole="button"
                accessibilityLabel="Business country" accessibilityHint="Opens country selection" style={styles.countryButton}>
                <View>
                  <Text style={styles.fieldLabel}>Business country</Text>
                  <Text style={styles.countryValue}>{data.country}</Text>
                </View>
                <Feather name="chevron-down" size={20} color={theme.colors.textSecondary} />
              </Pressable>
              <View style={styles.locationNote}>
                <Feather name="map-pin" size={18} color={theme.colors.accentText} />
                <Text style={styles.locationText}>Your business location is set to {data.country}.</Text>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          ) : null}

            {step === 2 ? (
            <View style={styles.options}>
              <TaxOption selected={data.gstRegistrationStatus === 'registered'} title="Yes, calculate GST" body="Use the country tax default on new transactions." onPress={() => selectGst('registered')} />
              <TaxOption selected={data.gstRegistrationStatus === 'not_registered'} title="No, I’m not registered" body="New transactions will not add GST by default." onPress={() => selectGst('not_registered')} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
            ) : null}
          </Animated.View>
        </ScrollView>

        <View style={styles.footer}>
          <ModernButton fullWidth size="lg" loading={isLoading} onPress={() => void next()}>
            {isLoading ? 'Setting up…' : step === 2 ? 'Finish setup' : 'Continue'}
          </ModernButton>
          <Text style={styles.footerNote}>You can change these details later in Settings.</Text>
        </View>
      </KeyboardAvoidingView>

      <CountryPicker visible={showCountryPicker} selectedCountry={data.country}
        onSelect={(country) => {
          if (country !== data.country) selectionHaptic();
          update({ country });
        }} onClose={() => setShowCountryPicker(false)} />
    </SafeAreaView>
  );
}

function TaxOption({ selected, title, body, onPress }: { selected: boolean; title: string; body: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}
      style={[styles.option, selected && styles.optionSelected]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionBody}>{body}</Text>
      </View>
    </Pressable>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { minHeight: 56, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backHidden: { opacity: 0 },
  headerTitle: { ...theme.type.headline },
  stepCount: { ...theme.type.caption, width: 44, textAlign: 'right' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: space.xxl, paddingBottom: space.xxl },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: theme.colors.fill },
  progressTrackActive: { backgroundColor: theme.colors.accent },
  content: { flexGrow: 1, paddingHorizontal: space.xxl, paddingBottom: space.section },
  title: { ...theme.type.display, fontSize: 34, lineHeight: 40, marginBottom: space.md },
  subtitle: { ...theme.type.body, color: theme.colors.textSecondary, lineHeight: 24, marginBottom: space.section },
  countryButton: { minHeight: 76, padding: space.lg, borderRadius: radius.md, backgroundColor: theme.colors.fillMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: theme.colors.border },
  fieldLabel: { ...theme.type.caption, marginBottom: space.xs },
  countryValue: { ...theme.type.headline },
  locationNote: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg, padding: space.lg, borderRadius: radius.md, backgroundColor: theme.colors.accentFill },
  locationText: { ...theme.type.subhead, color: theme.colors.text, flex: 1 },
  options: { gap: space.md },
  option: { minHeight: 88, flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.fillMuted },
  optionSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentFill },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: theme.colors.accentText },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.accentText },
  optionCopy: { flex: 1 },
  optionTitle: { ...theme.type.headline, marginBottom: space.xs },
  optionBody: { ...theme.type.subhead, lineHeight: 20 },
  error: { ...theme.type.footnote, color: theme.colors.danger, marginTop: space.sm },
  footer: { paddingHorizontal: space.xxl, paddingBottom: space.lg },
  footerNote: { ...theme.type.footnote, textAlign: 'center', marginTop: space.md },
});
