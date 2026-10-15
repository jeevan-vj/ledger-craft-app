import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/store';
import { SettingsStackParamList } from '@/navigation/types';
import { GroupedSection } from '@/components/ui/GroupedSection';
import { ListRow } from '@/components/ui/ListRow';
import { palette, space } from '@/theme/tokens';

type NavigationProp = NativeStackNavigationProp<SettingsStackParamList, 'SettingsList'>;

export default function SettingsScreen() {
  const { signOut, user } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.user_metadata?.full_name || user?.email || 'L')
              .slice(0, 1)
              .toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.user_metadata?.full_name || 'LedgerCraft'}</Text>
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </View>

      <GroupedSection title="Business">
        <ListRow
          label="Business"
          subtitle="Profile, GST, and invoice numbering"
          icon={<Feather name="briefcase" size={15} color={palette.accentForeground} />}
          onPress={() => navigation.navigate('BusinessSettings')}
        />
        <ListRow
          label="Account"
          subtitle="Coming soon"
          icon={<Feather name="user" size={15} color={palette.accentForeground} />}
          disabled
        />
        <ListRow
          label="Notifications"
          subtitle="Coming soon"
          icon={<Feather name="bell" size={15} color={palette.accentForeground} />}
          disabled
        />
      </GroupedSection>

      <GroupedSection>
        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </GroupedSection>

      <View style={styles.appInfo}>
        <Text style={styles.appInfoText}>LedgerCraft</Text>
        <Text style={styles.appInfoText}>Version 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingHorizontal: space.screen,
    paddingTop: 8,
    paddingBottom: 48,
  },
  profile: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.accentForeground,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: -0.3,
  },
  email: {
    fontSize: 15,
    color: palette.textSecondary,
    marginTop: 4,
  },
  signOut: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  signOutPressed: {
    backgroundColor: palette.fillMuted,
  },
  signOutText: {
    fontSize: 17,
    fontWeight: '500',
    color: palette.danger,
  },
  appInfo: {
    alignItems: 'center',
    paddingTop: 8,
  },
  appInfoText: {
    fontSize: 13,
    color: palette.textTertiary,
    marginBottom: 2,
  },
});
