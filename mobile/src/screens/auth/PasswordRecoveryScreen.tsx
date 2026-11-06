import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList, RootStackParamList } from '@/navigation/types';
import { requestPasswordReset, resetPassword } from '@/features/auth/api/authApi';
import { ModernInput, ModernButton } from '@/components/ui';
import { useAuth } from '@/store';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';

export function ForgotPasswordScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>) {
  return <ForgotPasswordContent onBackToSignIn={() => navigation.navigate('Login')} />;
}

export function RootForgotPasswordScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>) {
  const { signOut } = useAuth();
  return <ForgotPasswordContent onBackToSignIn={() => { void signOut(); }} />;
}

function ForgotPasswordContent({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  const theme = useTheme();
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await requestPasswordReset(email.trim()); setSent(true); }
    catch (error) { Alert.alert('Couldn’t send link', error instanceof Error ? error.message : 'Try again.'); }
    finally { setBusy(false); }
  };
  return <AuthShell title="Reset your password" subtitle="We’ll send a secure, single-use link if an account exists.">
    {sent ? <View><Text accessibilityRole="text" style={[theme.type.body, styles.message]}>Check your email. If that address has an account, a reset link is on its way.</Text><ModernButton onPress={onBackToSignIn} fullWidth>Back to sign in</ModernButton></View> : <>
      <ModernInput label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <ModernButton onPress={submit} loading={busy} disabled={!email.trim()} fullWidth>{busy ? 'Sending…' : 'Send reset link'}</ModernButton>
    </>}
  </AuthShell>;
}

export function ResetPasswordScreen({ navigation, route }: NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>) {
  return <ResetPasswordContent token={route.params?.token} callbackError={route.params?.error} onRequestNew={() => navigation.replace('ForgotPassword')} onSignIn={() => navigation.replace('Login')} />;
}

export function RootResetPasswordScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'ResetPassword'>) {
  const { signOut } = useAuth();
  return <ResetPasswordContent token={route.params?.token} callbackError={route.params?.error} onRequestNew={() => navigation.replace('ForgotPassword')} onSignIn={() => { void signOut(); }} />;
}

function ResetPasswordContent({ token = '', callbackError, onRequestNew, onSignIn }: { token?: string; callbackError?: string; onRequestNew: () => void; onSignIn: () => void }) {
  const theme = useTheme();
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const submit = async () => {
    if (password.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    if (password !== confirm) return Alert.alert('Passwords don’t match', 'Enter the same password twice.');
    setBusy(true);
    try { await resetPassword(token, password); setDone(true); }
    catch { Alert.alert('Link not valid', 'This reset link is invalid, expired, or has already been used.'); }
    finally { setBusy(false); }
  };
  return <AuthShell title="Choose a new password" subtitle="Completing this reset signs out every existing device.">
    {callbackError || !token ? <View><Text accessibilityRole="alert" style={[theme.type.body, styles.message]}>This reset link is invalid or has expired.</Text><ModernButton onPress={onRequestNew} fullWidth>Request a new link</ModernButton></View> : done ? <View><Text accessibilityRole="text" style={[theme.type.body, styles.message]}>Password reset. Sign in again on this and every other device.</Text><ModernButton onPress={onSignIn} fullWidth>Sign in</ModernButton></View> : <>
      <ModernInput label="New password" value={password} onChangeText={setPassword} secureTextEntry showPasswordToggle autoComplete="new-password" />
      <ModernInput label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry showPasswordToggle autoComplete="new-password" />
      <ModernButton onPress={submit} loading={busy} disabled={!password || !confirm} fullWidth>Reset password</ModernButton>
    </>}
  </AuthShell>;
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const theme = useTheme();
  return <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.colors.surface }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Text style={theme.type.title}>{title}</Text><Text style={[theme.type.subhead, styles.subtitle]}>{subtitle}</Text>{children}</ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { flexGrow: 1, paddingHorizontal: space.xxl, paddingTop: 80, paddingBottom: 40, gap: space.lg }, subtitle: { marginTop: -8, marginBottom: 8 }, message: { marginBottom: space.xl } });
