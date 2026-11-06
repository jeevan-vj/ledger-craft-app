import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { changeEmail, changePassword, listAccountSessions, revokeAccountSession, revokeAllSessions, revokeOtherSessions, type AccountSession } from '@/features/auth/api/authApi';
import { useAuth } from '@/store';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';

export default function AccountSecurityScreen() {
  const theme = useTheme(); const { signOut } = useAuth();
  const [sessions, setSessions] = useState<AccountSession[]>([]); const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [newEmail, setNewEmail] = useState('');
  const load = useCallback(async () => setSessions(await listAccountSessions()), []);
  useEffect(() => { void load().catch(() => Alert.alert('Couldn’t load devices', 'Check your connection and try again.')); }, [load]);
  const run = async (task: () => Promise<void>, success: string, reload = true) => { setBusy(true); try { await task(); if (reload) await load(); Alert.alert(success); } catch (error) { Alert.alert('Couldn’t update security', error instanceof Error ? error.message : 'Try again.'); } finally { setBusy(false); } };
  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={theme.type.title}>Account security</Text><Text style={theme.type.subhead}>Passwords, verified email changes, and signed-in devices.</Text>
    <Text style={[theme.type.headline, styles.heading]}>Password</Text><Card style={styles.card}><Text style={[theme.type.caption, styles.note]}>Changing it keeps this device signed in and signs out every other device.</Text><ModernInput label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry showPasswordToggle autoComplete="current-password" /><ModernInput label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry showPasswordToggle autoComplete="new-password" /><ModernButton fullWidth disabled={busy || !currentPassword || newPassword.length < 8} onPress={() => void run(async () => { await changePassword(currentPassword, newPassword); setCurrentPassword(''); setNewPassword(''); }, 'Password changed')}>Change password</ModernButton></Card>
    <Text style={[theme.type.headline, styles.heading]}>Email address</Text><Card style={styles.card}><Text style={[theme.type.caption, styles.note]}>Your current address stays active until the new one is verified.</Text><ModernInput label="New email address" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /><ModernButton fullWidth disabled={busy || !newEmail.includes('@')} onPress={() => void run(async () => { await changeEmail(newEmail); setNewEmail(''); }, 'Verification sent', false)}>Verify new email</ModernButton></Card>
    <Text style={[theme.type.headline, styles.heading]}>Signed-in devices</Text><Card style={styles.sessions}>{sessions.map((session, index) => <View key={session.token}>{index ? <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} /> : null}<ListRow label={session.current ? 'This device' : 'Signed-in device'} subtitle={`Signed in ${session.createdAt.toLocaleString()}${session.ipAddress ? ` · ${session.ipAddress}` : ''}`} onPress={session.current ? undefined : () => void run(() => revokeAccountSession(session.token), 'Device signed out')} accessibilityHint={session.current ? 'Current device' : 'Signs out this device'} /></View>)}</Card>
    <ModernButton variant="secondary" fullWidth disabled={busy} onPress={() => void run(revokeOtherSessions, 'Other devices signed out')}>Sign out other devices</ModernButton>
    <ModernButton variant="outline" fullWidth disabled={busy} onPress={() => Alert.alert('Sign out everywhere?', 'This includes the current device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out everywhere', style: 'destructive', onPress: () => void run(async () => { await revokeAllSessions(); await signOut(); }, 'Signed out everywhere', false) }])}>Sign out everywhere</ModernButton>
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 48, gap: space.md }, heading: { marginTop: space.lg }, card: { gap: space.lg }, note: { marginBottom: space.xs }, sessions: { padding: 0, overflow: 'hidden' }, divider: { height: StyleSheet.hairlineWidth, marginLeft: 20 } });
