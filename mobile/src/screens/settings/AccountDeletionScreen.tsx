import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppPressable, ModernInput } from '@/components/ui';
import { deleteAccount } from '@/features/auth/api/authApi';
import { useAuth } from '@/store';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '@/navigation/types';

export default function AccountDeletionScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList, 'AccountDeletion'>>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const enabled = password.length > 0 && confirmation === 'DELETE' && !submitting;

  const submit = async () => {
    if (!enabled) return;
    setSubmitting(true);
    setError('');
    try {
      await deleteAccount({ password, confirmation: 'DELETE' });
      await signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete your account. Try again.');
      setSubmitting(false);
    }
  };

  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={theme.type.display}>Permanently delete your account</Text>
    <Text style={[theme.type.body, styles.copy]}>Companies you own alone, their invoices, files, public links, and recurring schedules will be deleted. In a company with another owner, only your membership is removed.</Text>
    <View style={[styles.notice, { backgroundColor: theme.colors.fillMuted }]}>
      <Text style={theme.type.headline}>Export your records first</Text>
      <Text style={[theme.type.subhead, styles.noticeCopy]}>New Zealand businesses may need to keep tax records for 7 years. EasyBizInvoice does not retain them on your behalf after deletion.</Text>
      <Text style={[theme.type.subhead, styles.noticeCopy]}>A non-identifying deletion tombstone containing only a one-way account hash and deletion time is retained indefinitely so deletion retries stay safe.</Text>
      <AppPressable accessibilityRole="button" accessibilityLabel="Open financial reports to export" onPress={() => navigation.navigate('Reports')} style={styles.exportLink}><Text style={{ color: theme.colors.accentText, fontWeight: '700' }}>Open financial reports to export</Text></AppPressable>
    </View>
    <ModernInput label="Current password" value={password} onChangeText={setPassword} secureTextEntry showPasswordToggle autoComplete="current-password" />
    <ModernInput label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
    {error ? <Text accessibilityRole="alert" style={[theme.type.footnote, { color: theme.colors.danger, marginBottom: space.md }]}>{error}</Text> : null}
    <AppPressable accessibilityRole="button" accessibilityLabel="Permanently delete account" accessibilityState={{ disabled: !enabled, busy: submitting }} disabled={!enabled} onPress={submit} style={({ pressed }) => [styles.deleteButton, { backgroundColor: theme.colors.danger }, !enabled && styles.disabled, pressed && enabled && styles.pressed]}>
      <Text style={styles.deleteText}>{submitting ? 'Deleting…' : 'Permanently delete account'}</Text>
    </AppPressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: 64 },
  copy: { marginTop: space.md, marginBottom: space.xl },
  notice: { borderRadius: 16, padding: space.lg, marginBottom: space.xl },
  noticeCopy: { marginTop: space.sm },
  exportLink: { minHeight: 44, justifyContent: 'center', marginTop: space.sm },
  deleteButton: { minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
