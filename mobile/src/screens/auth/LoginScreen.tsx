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
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (emailError || passwordError) {
      Alert.alert('Error', 'Please fix the errors before continuing');
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      Alert.alert('Login Failed', authErrorMessage(error));
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      Alert.alert('Google Sign In Failed', authErrorMessage(error));
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

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

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
            onPress={handleLogin}
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            disabled={!email || !password || !!emailError || !!passwordError}
          >
            {loading ? 'Signing in...' : 'Continue'}
          </ModernButton>
        </View>

        <ModernButton onPress={handleGoogleSignIn} variant="secondary" fullWidth>
          Google
        </ModernButton>

        <Pressable
          onPress={() => navigation.navigate('Signup')}
          accessibilityRole="button"
          accessibilityLabel="Sign up"
          style={styles.footerLink}
        >
          <Text style={styles.footer}>
            Don't have an account? <Text style={styles.footerAction}>Sign up</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
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
    marginBottom: 12,
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
