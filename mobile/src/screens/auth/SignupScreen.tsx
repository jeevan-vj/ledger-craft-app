import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useAuth } from '@/store';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/types';
import { ModernInput } from '@/components/ui/ModernInput';
import { ModernButton } from '@/components/ui/ModernButton';
import { authErrorMessage } from '@/features/auth/api/authApi';
import { palette, radius, space, type } from '@/theme/tokens';

type SignupScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Signup'>;

export default function SignupScreen() {
  const navigation = useNavigation<SignupScreenNavigationProp>();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateEmail = (text: string) => {
    setEmail(text);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (text && !emailRegex.test(text)) {
      setEmailError('Invalid email address');
    } else {
      setEmailError('');
    }
  };

  const validatePassword = (text: string) => {
    setPassword(text);
    if (text && text.length < 8) {
      setPasswordError('Password must be at least 8 characters');
    } else {
      setPasswordError('');
    }
  };

  const handleSignup = async () => {
    if (!email || !password || !fullName) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (emailError || passwordError) {
      Alert.alert('Error', 'Please fix the errors before continuing');
      return;
    }

    setLoading(true);
    const { error, needsEmailConfirmation } = await signUp(email, password, fullName);
    setLoading(false);

    if (error) {
      Alert.alert('Signup Failed', authErrorMessage(error));
      return;
    } else if (needsEmailConfirmation) {
      Alert.alert(
        'Check your email',
        'Please verify your email address to continue',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Text style={styles.markText}>LC</Text>
          </View>
          <Text style={styles.wordmark}>LedgerCraft</Text>
        </View>

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Get started in a minute</Text>

        <ModernInput
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Enter your full name"
          autoCapitalize="words"
        />

        <ModernInput
          label="Email address"
          value={email}
          onChangeText={validateEmail}
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
          error={emailError}
        />

        <ModernInput
          label="Password"
          value={password}
          onChangeText={validatePassword}
          placeholder="Enter your password"
          secureTextEntry
          showPasswordToggle
          error={passwordError}
        />

        <View style={styles.cta}>
          <ModernButton
            onPress={handleSignup}
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            disabled={!email || !password || !fullName || !!emailError || !!passwordError}
          >
            {loading ? 'Creating account...' : 'Continue'}
          </ModernButton>
        </View>

        <Pressable
          onPress={() => navigation.navigate('Login')}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          style={styles.footerLink}
        >
          <Text style={styles.footer}>
            Already have an account? <Text style={styles.footerAction}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.xxl,
    paddingTop: 72,
    paddingBottom: 40,
  },
  brand: {
    marginBottom: 36,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.well,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  markText: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.accentForeground,
  },
  wordmark: {
    ...type.headline,
  },
  title: {
    ...type.title,
    marginBottom: 6,
  },
  subtitle: {
    ...type.subhead,
    marginBottom: 28,
  },
  cta: {
    marginTop: 8,
  },
  footerLink: {
    marginTop: 28,
    minHeight: 44,
    justifyContent: 'center',
  },
  footer: {
    ...type.subhead,
    textAlign: 'center',
  },
  footerAction: {
    color: palette.accentForeground,
    fontWeight: '600',
  },
});
