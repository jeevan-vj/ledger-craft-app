import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import {
  accountStepError,
  normalizedEmail,
  safeAccountDraft,
  type AccountDraft,
} from '@/features/onboarding/onboardingModel';
import { onboardingStorage } from '@/features/onboarding/onboardingStorage';
import { authErrorMessage } from '@/features/auth/api/authApi';
import type { AuthStackParamList } from '@/navigation/types';
import { useAuth } from '@/store';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type Navigation = NativeStackNavigationProp<AuthStackParamList, 'Signup'>;

const steps = [
  { title: 'What should we call you?', body: 'Use the name you want to see around LedgerCraft.' },
  { title: 'What is your phone number?', body: 'Optional. We use it only for your business contact details.' },
  { title: 'What is your email?', body: 'This becomes the email you use to sign in.' },
  { title: 'Secure your account', body: 'Choose a password and confirm you agree to our policies.' },
] as const;

const emptyDraft: AccountDraft = {
  fullName: '', phone: '', email: '', password: '', acceptedTerms: false,
};

export default function SignupScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<Navigation>();
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    onboardingStorage.loadAccountDraft().then((saved) => {
      if (saved) setDraft((current) => ({ ...current, ...saved }));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 180);
    return () => clearTimeout(timer);
  }, [step]);

  const update = (changes: Partial<AccountDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setError(undefined);
  };

  const goBack = () => {
    if (step > 0) {
      setError(undefined);
      setStep((current) => current - 1);
    } else navigation.goBack();
  };

  const continueFlow = async () => {
    const validation = accountStepError(step, draft);
    if (validation) {
      setError(validation);
      return;
    }
    await onboardingStorage.saveAccountDraft(safeAccountDraft(draft)).catch(() => undefined);
    if (step < steps.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    setLoading(true);
    const result = await signUp(normalizedEmail(draft.email), draft.password, draft.fullName.trim());
    setLoading(false);
    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    navigation.replace('Onboarding');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="arrow-left" size={22} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Account details</Text>
          <Text style={styles.stepCount}>{step + 1}/{steps.length}</Text>
        </View>
        <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((item, index) => (
            <View key={item.title} style={[styles.progressTrack, index <= step && styles.progressTrackActive]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
          <Animated.View key={step} entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}>
            <Text style={styles.title}>{steps[step].title}</Text>
            <Text style={styles.subtitle}>{steps[step].body}</Text>

          {step === 0 ? (
            <ModernInput ref={inputRef} label="Full name" value={draft.fullName} onChangeText={(fullName) => update({ fullName })}
              placeholder="Your full name" autoCapitalize="words" autoComplete="name" returnKeyType="next" error={error}
              onSubmitEditing={() => void continueFlow()} />
          ) : null}
          {step === 1 ? (
            <ModernInput ref={inputRef} label="Phone number (optional)" value={draft.phone} onChangeText={(phone) => update({ phone })}
              placeholder="+64 21 000 0000" keyboardType="phone-pad" autoComplete="tel" returnKeyType="next" error={error}
              onSubmitEditing={() => void continueFlow()} />
          ) : null}
          {step === 2 ? (
            <ModernInput ref={inputRef} label="Email address" value={draft.email} onChangeText={(email) => update({ email })}
              placeholder="you@business.co.nz" keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              autoComplete="email" returnKeyType="next" error={error} onSubmitEditing={() => void continueFlow()} />
          ) : null}
            {step === 3 ? (
            <>
              <ModernInput ref={inputRef} label="Password" value={draft.password} onChangeText={(password) => update({ password })}
                placeholder="At least 8 characters" secureTextEntry showPasswordToggle autoComplete="new-password" returnKeyType="done"
                error={error && draft.password.length < 8 ? error : undefined} onSubmitEditing={() => void continueFlow()} />
              <Pressable onPress={() => update({ acceptedTerms: !draft.acceptedTerms })} accessibilityRole="checkbox"
                accessibilityState={{ checked: draft.acceptedTerms }} style={styles.consent}>
                <View style={[styles.checkbox, draft.acceptedTerms && styles.checkboxChecked]}>
                  {draft.acceptedTerms ? <Feather name="check" size={16} color={theme.colors.accentForeground} /> : null}
                </View>
                <Text style={styles.consentText}>I agree to LedgerCraft’s terms of use and privacy policy.</Text>
              </Pressable>
              {error && draft.password.length >= 8 ? <Text style={styles.error}>{error}</Text> : null}
            </>
            ) : null}
          </Animated.View>
        </ScrollView>

        <View style={styles.footer}>
          <ModernButton fullWidth size="lg" loading={loading} onPress={() => void continueFlow()}>
            {loading ? 'Creating account…' : step === steps.length - 1 ? 'Create account' : 'Continue'}
          </ModernButton>
          {step === 0 ? (
            <ModernButton fullWidth variant="ghost" onPress={() => navigation.replace('Login')}>
              Already have an account? Log in
            </ModernButton>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { minHeight: 56, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...theme.type.headline },
  stepCount: { ...theme.type.caption, width: 44, textAlign: 'right' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: space.xxl, paddingBottom: space.xxl },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: theme.colors.fill },
  progressTrackActive: { backgroundColor: theme.colors.accent },
  content: { flexGrow: 1, paddingHorizontal: space.xxl, paddingBottom: space.section },
  title: { ...theme.type.display, fontSize: 34, lineHeight: 40, marginBottom: space.md },
  subtitle: { ...theme.type.body, color: theme.colors.textSecondary, lineHeight: 24, marginBottom: space.section },
  consent: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: theme.colors.fillMuted },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  consentText: { ...theme.type.subhead, flex: 1, lineHeight: 21 },
  error: { ...theme.type.footnote, color: theme.colors.danger, marginTop: space.sm },
  footer: { paddingHorizontal: space.xxl, paddingBottom: space.lg, gap: space.sm },
});
