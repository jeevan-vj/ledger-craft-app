import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/store';
import type { MoreStackParamList } from '@/navigation/types';
import { Card, DashedSetupCard, ListRow } from '@/components/ui';
import { useTheme } from '@/theme';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'SettingsList'>;
export default function SettingsScreen() {
  const theme = useTheme();
  const { signOut, user } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const name = user?.user_metadata?.full_name || 'LedgerCraft member';
  const icon = (name: React.ComponentProps<typeof Feather>['name']) => <Feather name={name} size={18} color={theme.colors.accentText} />;
  const confirmSignOut = () => Alert.alert('Sign out?', 'You can sign back in anytime.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }]);

  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.profile}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.accent }]}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
      <Text style={[theme.type.display, styles.name]}>{name}</Text>
      {user?.email ? <Text style={theme.type.subhead}>{user.email}</Text> : null}
    </View>

    <Text style={[theme.type.headline, styles.sectionTitle]}>Your account</Text>
    <Card style={styles.sectionCard}>
      <ListRow label="Business profile" subtitle="Details, GST and invoice numbering" icon={icon('briefcase')} onPress={() => navigation.navigate('BusinessSettings')} />
      <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
      <ListRow label="Expenses" subtitle="Track purchases and receipts" icon={icon('credit-card')} onPress={() => navigation.navigate('ExpenseList')} />
      <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
      <ListRow label="Purchases" subtitle="Vendors, bills and payments" icon={icon('shopping-bag')} onPress={() => navigation.navigate('PurchaseList')} />
    </Card>

    <Text style={[theme.type.headline, styles.sectionTitle]}>Settings</Text>
    <Card style={styles.sectionCard}>
      <ListRow label="Notifications" subtitle="Choose what needs your attention" icon={icon('bell')} showChevron={false} disabled />
      <View style={[styles.divider, { backgroundColor: theme.colors.separator }]} />
      <ListRow label="Security" subtitle="Password and trusted devices" icon={icon('shield')} showChevron={false} disabled />
    </Card>
    <DashedSetupCard title="Connect a bank account" description="Automatic transaction matching is not set up yet." icon="link" />

    <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={confirmSignOut} style={({ pressed }) => [styles.signOut, { borderColor: theme.colors.border }, pressed && { opacity: 0.65 }]}><Text style={{ color: theme.colors.danger, fontWeight: '700', fontSize: 16 }}>Sign out</Text></Pressable>
    <Text style={[theme.type.caption, styles.version]}>LedgerCraft · Version 1.0.0</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 }, profile: { alignItems: 'center', marginBottom: 36 },
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, avatarText: { fontSize: 36, fontWeight: '900', color: '#163300' },
  name: { textAlign: 'center', marginBottom: 4 }, sectionTitle: { marginBottom: 12, marginTop: 8 }, sectionCard: { padding: 0, overflow: 'hidden', marginBottom: 28 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 76 }, signOut: { minHeight: 52, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 28 }, version: { textAlign: 'center', marginTop: 20 },
});
